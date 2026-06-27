use std::fs::OpenOptions;
use std::io::{self, BufWriter, Write};
use std::panic::{self, AssertUnwindSafe};
use std::ptr;
use std::slice;
use std::str;
use std::sync::Mutex;

const ABI_VERSION: u32 = 1;

const STATUS_OK: i32 = 0;
const STATUS_NULL_HANDLE: i32 = 1;
const STATUS_NULL_BYTES_POINTER: i32 = 2;
const STATUS_INVALID_UTF8: i32 = 3;
const STATUS_IO_ERROR: i32 = 4;
const STATUS_PANIC_CAUGHT: i32 = 5;
const STATUS_INVALID_DESTINATION: i32 = 6;
const STATUS_INVALID_PATH: i32 = 7;
const STATUS_UNKNOWN_ERROR: i32 = 255;

static GLOBAL_LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

pub struct PequiHandle {
    sink: Mutex<NativeSink>,
    last_error: Mutex<Option<String>>,
}

impl PequiHandle {
    fn new(sink: NativeSink) -> Self {
        Self {
            sink: Mutex::new(sink),
            last_error: Mutex::new(None),
        }
    }

    fn set_error(&self, message: impl Into<String>) {
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = Some(sanitize_error_message(message.into()));
        }
    }
}

impl Drop for PequiHandle {
    fn drop(&mut self) {
        if let Ok(mut sink) = self.sink.lock() {
            let _ = sink.flush();
        }
    }
}

enum NativeSink {
    Unbuffered(Box<dyn Write + Send>),
    Buffered(BufWriter<Box<dyn Write + Send>>),
}

impl NativeSink {
    fn new(writer: Box<dyn Write + Send>, buffer_size: usize) -> Self {
        if buffer_size == 0 {
            Self::Unbuffered(writer)
        } else {
            Self::Buffered(BufWriter::with_capacity(buffer_size, writer))
        }
    }

    fn write_all(&mut self, bytes: &[u8]) -> io::Result<()> {
        match self {
            Self::Unbuffered(writer) => writer.write_all(bytes),
            Self::Buffered(writer) => writer.write_all(bytes),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Unbuffered(writer) => writer.flush(),
            Self::Buffered(writer) => writer.flush(),
        }
    }
}

struct NativeError {
    code: i32,
    message: String,
}

impl NativeError {
    fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    fn io(context: &str, error: io::Error) -> Self {
        Self::new(STATUS_IO_ERROR, format!("{context}: {error}"))
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_abi_version() -> u32 {
    ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_init(
    destination_kind: u8,
    path_ptr: *const u8,
    path_len: usize,
    buffer_size: usize,
) -> *mut PequiHandle {
    match panic::catch_unwind(AssertUnwindSafe(|| {
        init_inner(destination_kind, path_ptr, path_len, buffer_size)
    })) {
        Ok(Ok(handle)) => Box::into_raw(Box::new(handle)),
        Ok(Err(error)) => {
            set_global_error(error.message);
            ptr::null_mut()
        }
        Err(_) => {
            set_global_error("panic caught during pequi_init");
            ptr::null_mut()
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_write(
    handle: *mut PequiHandle,
    bytes_ptr: *const u8,
    bytes_len: usize,
) -> i32 {
    match panic::catch_unwind(AssertUnwindSafe(|| {
        write_inner(handle, bytes_ptr, bytes_len)
    })) {
        Ok(code) => code,
        Err(_) => {
            set_handle_error(handle, "panic caught during pequi_write");
            STATUS_PANIC_CAUGHT
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_flush(handle: *mut PequiHandle) -> i32 {
    match panic::catch_unwind(AssertUnwindSafe(|| flush_inner(handle))) {
        Ok(code) => code,
        Err(_) => {
            set_handle_error(handle, "panic caught during pequi_flush");
            STATUS_PANIC_CAUGHT
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_last_error(
    handle: *mut PequiHandle,
    out_ptr: *mut u8,
    out_len: usize,
) -> usize {
    panic::catch_unwind(AssertUnwindSafe(|| {
        let Some(handle) = ptr_to_ref(handle) else {
            return 0;
        };

        let Ok(last_error) = handle.last_error.lock() else {
            return 0;
        };

        copy_error_message(last_error.as_deref(), out_ptr, out_len)
    }))
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_last_error_global(out_ptr: *mut u8, out_len: usize) -> usize {
    panic::catch_unwind(AssertUnwindSafe(|| {
        let Ok(last_error) = GLOBAL_LAST_ERROR.lock() else {
            return 0;
        };

        copy_error_message(last_error.as_deref(), out_ptr, out_len)
    }))
    .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn pequi_drop(handle: *mut PequiHandle) {
    if handle.is_null() {
        return;
    }

    if panic::catch_unwind(AssertUnwindSafe(|| unsafe {
        drop(Box::from_raw(handle));
    }))
    .is_err()
    {
        set_global_error("panic caught during pequi_drop");
    }
}

fn init_inner(
    destination_kind: u8,
    path_ptr: *const u8,
    path_len: usize,
    buffer_size: usize,
) -> Result<PequiHandle, NativeError> {
    let writer: Box<dyn Write + Send> = match destination_kind {
        0 => Box::new(io::sink()),
        1 => Box::new(io::stdout()),
        2 => Box::new(io::stderr()),
        3 => Box::new(open_file(path_ptr, path_len)?),
        _ => {
            return Err(NativeError::new(
                STATUS_INVALID_DESTINATION,
                format!("invalid destination kind: {destination_kind}"),
            ));
        }
    };

    Ok(PequiHandle::new(NativeSink::new(writer, buffer_size)))
}

fn open_file(path_ptr: *const u8, path_len: usize) -> Result<std::fs::File, NativeError> {
    if path_ptr.is_null() || path_len == 0 {
        return Err(NativeError::new(
            STATUS_INVALID_PATH,
            "file destination requires a non-empty UTF-8 path",
        ));
    }

    let path_bytes = unsafe { slice::from_raw_parts(path_ptr, path_len) };
    let path = str::from_utf8(path_bytes)
        .map_err(|error| NativeError::new(STATUS_INVALID_UTF8, error.to_string()))?;

    if path.is_empty() {
        return Err(NativeError::new(
            STATUS_INVALID_PATH,
            "file destination requires a non-empty path",
        ));
    }

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| NativeError::io("failed to open file destination", error))
}

fn write_inner(handle: *mut PequiHandle, bytes_ptr: *const u8, bytes_len: usize) -> i32 {
    let Some(handle) = ptr_to_ref(handle) else {
        return STATUS_NULL_HANDLE;
    };

    if bytes_len == 0 {
        return STATUS_OK;
    }

    if bytes_ptr.is_null() {
        handle.set_error("write received a null bytes pointer");
        return STATUS_NULL_BYTES_POINTER;
    }

    let bytes = unsafe { slice::from_raw_parts(bytes_ptr, bytes_len) };
    match with_sink(handle, |sink| sink.write_all(bytes)) {
        Ok(()) => STATUS_OK,
        Err(error) => store_handle_error(handle, error),
    }
}

fn flush_inner(handle: *mut PequiHandle) -> i32 {
    let Some(handle) = ptr_to_ref(handle) else {
        return STATUS_NULL_HANDLE;
    };

    match with_sink(handle, NativeSink::flush) {
        Ok(()) => STATUS_OK,
        Err(error) => store_handle_error(handle, error),
    }
}

fn with_sink(
    handle: &PequiHandle,
    operation: impl FnOnce(&mut NativeSink) -> io::Result<()>,
) -> Result<(), NativeError> {
    let mut sink = handle
        .sink
        .lock()
        .map_err(|_| NativeError::new(STATUS_UNKNOWN_ERROR, "native sink mutex was poisoned"))?;

    operation(&mut sink).map_err(|error| NativeError::io("native sink I/O error", error))
}

fn store_handle_error(handle: &PequiHandle, error: NativeError) -> i32 {
    let NativeError { code, message } = error;
    handle.set_error(message);
    code
}

fn ptr_to_ref<'a>(handle: *mut PequiHandle) -> Option<&'a PequiHandle> {
    if handle.is_null() {
        None
    } else {
        unsafe { handle.as_ref() }
    }
}

fn set_handle_error(handle: *mut PequiHandle, message: impl Into<String>) {
    if let Some(handle) = ptr_to_ref(handle) {
        handle.set_error(message);
    }
}

fn set_global_error(message: impl Into<String>) {
    if let Ok(mut last_error) = GLOBAL_LAST_ERROR.lock() {
        *last_error = Some(sanitize_error_message(message.into()));
    }
}

fn sanitize_error_message(message: String) -> String {
    message.replace('\0', " ")
}

fn copy_error_message(message: Option<&str>, out_ptr: *mut u8, out_len: usize) -> usize {
    let Some(message) = message else {
        return 0;
    };

    let bytes = message.as_bytes();
    if !out_ptr.is_null() && out_len > 0 {
        let copy_len = bytes.len().min(out_len);
        unsafe {
            ptr::copy_nonoverlapping(bytes.as_ptr(), out_ptr, copy_len);
        }
    }

    bytes.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn abi_version_is_one() {
        assert_eq!(pequi_abi_version(), 1);
    }

    #[test]
    fn discard_sink_accepts_write_flush_and_drop() {
        let handle = pequi_init(0, ptr::null::<u8>(), 0, 0);
        assert!(!handle.is_null());

        let line = b"{\"level\":30,\"msg\":\"ok\"}\n";
        assert_eq!(pequi_write(handle, line.as_ptr(), line.len()), STATUS_OK);
        assert_eq!(pequi_flush(handle), STATUS_OK);

        pequi_drop(handle);
    }

    #[test]
    fn null_bytes_pointer_reports_stable_code() {
        let handle = pequi_init(0, ptr::null::<u8>(), 0, 0);
        assert!(!handle.is_null());

        assert_eq!(
            pequi_write(handle, ptr::null::<u8>(), 1),
            STATUS_NULL_BYTES_POINTER
        );

        pequi_drop(handle);
    }

    #[test]
    fn invalid_destination_sets_global_error() {
        let handle = pequi_init(99, ptr::null::<u8>(), 0, 0);
        assert!(handle.is_null());

        let mut buffer = [0_u8; 128];
        let len = pequi_last_error_global(buffer.as_mut_ptr(), buffer.len());
        let message = str::from_utf8(&buffer[..len]).expect("valid error message");

        assert!(message.contains("invalid destination kind"));
    }
}
