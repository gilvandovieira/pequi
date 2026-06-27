use std::ffi::CString;
use std::io::{self, Write};
use std::os::raw::c_char;
use std::ptr;
use std::slice;
use std::sync::Mutex;

pub struct PequiHandle {
    last_error: Mutex<Option<CString>>,
}

impl PequiHandle {
    fn new() -> Self {
        Self {
            last_error: Mutex::new(None),
        }
    }

    fn set_error(&self, message: String) {
        let sanitized = message.replace('\0', " ");
        if let Ok(mut last_error) = self.last_error.lock() {
            *last_error = CString::new(sanitized).ok();
        }
    }
}

#[no_mangle]
pub extern "C" fn pequi_init() -> *mut PequiHandle {
    Box::into_raw(Box::new(PequiHandle::new()))
}

#[no_mangle]
pub unsafe extern "C" fn pequi_write(
    handle: *mut PequiHandle,
    ptr: *const u8,
    len: usize,
) -> i32 {
    let Some(handle) = handle.as_ref() else {
        return 1;
    };

    if ptr.is_null() && len > 0 {
        handle.set_error("write received a null pointer".to_string());
        return 1;
    }

    let bytes: &[u8] = if len == 0 {
        &[]
    } else {
        slice::from_raw_parts(ptr, len)
    };
    match io::stdout().write_all(bytes) {
        Ok(()) => 0,
        Err(error) => {
            handle.set_error(error.to_string());
            1
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn pequi_flush(handle: *mut PequiHandle) -> i32 {
    let Some(handle) = handle.as_ref() else {
        return 1;
    };

    match io::stdout().flush() {
        Ok(()) => 0,
        Err(error) => {
            handle.set_error(error.to_string());
            1
        }
    }
}

#[no_mangle]
pub unsafe extern "C" fn pequi_last_error(
    handle: *mut PequiHandle,
    buffer: *mut c_char,
    buffer_len: usize,
) -> usize {
    let Some(handle) = handle.as_ref() else {
        return 0;
    };

    let Ok(last_error) = handle.last_error.lock() else {
        return 0;
    };

    let Some(message) = last_error.as_ref() else {
        return 0;
    };

    let bytes = message.as_bytes();
    if !buffer.is_null() && buffer_len > 0 {
        let copy_len = bytes.len().min(buffer_len);
        ptr::copy_nonoverlapping(bytes.as_ptr(), buffer.cast::<u8>(), copy_len);
    }

    bytes.len()
}

#[no_mangle]
pub unsafe extern "C" fn pequi_drop(handle: *mut PequiHandle) {
    if !handle.is_null() {
        drop(Box::from_raw(handle));
    }
}
