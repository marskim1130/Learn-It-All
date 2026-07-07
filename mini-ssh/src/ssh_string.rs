//! SSH 二进制协议的基础数据类型。
//!
//! SSH 里到处都是这种格式：`uint32 length` + `length` 字节的内容，
//! 称为 "string"（也用于 name-list、算法名、密钥等）。
//! 我们把它抽成公共读写函数，后面的 KEX / 认证 / 信道都建立在它之上。

use std::io::{Read, Result};

/// 写入一个 SSH string（uint32 长度前缀 + 数据）。
pub fn write_string(buf: &mut Vec<u8>, data: &[u8]) {
    buf.extend_from_slice(&(data.len() as u32).to_be_bytes());
    buf.extend_from_slice(data);
}

/// 写入一个字符串内容的 SSH string。
pub fn write_string_str(buf: &mut Vec<u8>, s: &str) {
    write_string(buf, s.as_bytes());
}

/// 从 reader 连续读取一个 SSH string（适用于流式解析）。
pub fn read_string<R: Read>(reader: &mut R) -> Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut data = vec![0u8; len];
    reader.read_exact(&mut data)?;
    Ok(data)
}

/// 从字节切片 + 游标读取一个 SSH string（适用于解析已读入内存的消息体）。
/// `pos` 在调用后自动前进到内容末尾。
pub fn read_string_at(data: &[u8], pos: &mut usize) -> Result<Vec<u8>> {
    if *pos + 4 > data.len() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::UnexpectedEof,
            "truncated string length",
        ));
    }
    let len = u32::from_be_bytes([
        data[*pos],
        data[*pos + 1],
        data[*pos + 2],
        data[*pos + 3],
    ]) as usize;
    *pos += 4;
    if *pos + len > data.len() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::UnexpectedEof,
            "truncated string body",
        ));
    }
    let s = data[*pos..*pos + len].to_vec();
    *pos += len;
    Ok(s)
}

/// 同 `read_string_at`，但把内容按 UTF-8 解释成字符串（用于算法名列表）。
pub fn read_string_str_at(data: &[u8], pos: &mut usize) -> Result<String> {
    let v = read_string_at(data, pos)?;
    String::from_utf8(v).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

pub fn write_u32(buf: &mut Vec<u8>, v: u32) {
    buf.extend_from_slice(&v.to_be_bytes());
}

pub fn write_byte(buf: &mut Vec<u8>, b: u8) {
    buf.push(b);
}
