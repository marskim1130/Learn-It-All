//! 传输层：负责把数据切成「完整的 SSH 二进制包」。
//!
//! 这是理解 SSH 最关键的一层。KEX 之前（也就是我们现在实现的阶段），
//! 包是**明文**、且**没有 MAC**。格式为：
//!
//! ```text
//! uint32 packet_length          (注意：不含这 4 字节本身)
//! byte   padding_length
//! byte[] payload                 (真正的消息内容)
//! byte[] padding                 (长度 padding_length，用于对齐)
//! ```
//!
//! 整个包（含 4 字节头）必须对齐到 cipher block size；在 KEX 之前视为 8。

use std::io::{Read, Result, Write};
use std::time::{SystemTime, UNIX_EPOCH};

const BLOCK_SIZE: usize = 8;

/// 生成一个简单的伪随机序列，仅用于学习阶段的 padding。
/// 真实实现必须用密码学安全的随机数（如 `rand` crate）以防流量分析。
fn random_bytes(n: usize) -> Vec<u8> {
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;
    let mut state = seed | 1;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        out.push((state >> 32) as u8);
    }
    out
}

/// 写出一个完整的明文 SSH 包。
///
/// 计算 padding 长度，使 `(4 + 1 + payload + padding) % 8 == 0` 且 `padding >= 4`，
/// 然后把 `长度头 + padding_length + payload + padding` 写到 writer。
pub fn write_packet<W: Write>(writer: &mut W, payload: &[u8]) -> Result<()> {
    let mut padding_len = BLOCK_SIZE - ((1 + payload.len() + 4) % BLOCK_SIZE);
    if padding_len < 4 {
        padding_len += BLOCK_SIZE;
    }

    let packet_len = 1u32 + payload.len() as u32 + padding_len as u32;

    let mut packet = Vec::with_capacity(4 + packet_len as usize);
    packet.extend_from_slice(&packet_len.to_be_bytes());
    packet.push(padding_len as u8);
    packet.extend_from_slice(payload);
    packet.extend_from_slice(&random_bytes(padding_len));

    writer.write_all(&packet)?;
    writer.flush()?;
    Ok(())
}

/// 读取一个完整的明文 SSH 包，返回其中的 payload。
///
/// TCP 是流，`read_exact` 按 `packet_length` 精确切出一个包，
/// 这正是「按长度切流」的标准做法。
pub fn read_packet<R: Read>(reader: &mut R) -> Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let packet_len = u32::from_be_bytes(len_buf) as usize;

    let mut rest = vec![0u8; packet_len];
    reader.read_exact(&mut rest)?;

    let padding_len = rest[0] as usize;
    // rest = [padding_length(1)] [payload...] [padding...]
    if padding_len + 1 > packet_len {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid padding length",
        ));
    }
    let payload = rest[1..packet_len - padding_len].to_vec();
    Ok(payload)
}
