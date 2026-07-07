//! 密钥交换的第一步：算法协商（SSH_MSG_KEXINIT）。
//!
//! 双方各发一个 KEXINIT 包，列出自己支持的算法列表，然后取交集。
//! 我们这里只声明一组最简单、文档最全的算法（group14 + aes128-ctr +
//! hmac-sha1），方便后续把 DH 密钥交换真正跑通。

use crate::ssh_string::*;
use std::io::Result;

pub const SSH_MSG_KEXINIT: u8 = 20;

#[derive(Debug)]
pub struct KexInit {
    pub kex_algorithms: String,
    pub server_host_key_algorithms: String,
    pub encryption_c2s: String,
    pub encryption_s2c: String,
    pub mac_c2s: String,
    pub mac_s2c: String,
    pub compression_c2s: String,
    pub compression_s2c: String,
    pub languages_c2s: String,
    pub languages_s2c: String,
    pub first_kex_packet_follows: bool,
}

/// 构造客户端 KEXINIT 的 payload（不含外层包封装，交给 transport 去打包）。
pub fn build_kexinit() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.push(SSH_MSG_KEXINIT);
    payload.extend_from_slice(&[0u8; 16]); // cookie：真实实现用随机 16 字节

    write_string_str(&mut payload, "diffie-hellman-group14-sha1");
    write_string_str(&mut payload, "ssh-rsa");
    write_string_str(&mut payload, "aes128-ctr");
    write_string_str(&mut payload, "aes128-ctr");
    write_string_str(&mut payload, "hmac-sha1");
    write_string_str(&mut payload, "hmac-sha1");
    write_string_str(&mut payload, "none");
    write_string_str(&mut payload, "none");
    write_string_str(&mut payload, ""); // languages c2s
    write_string_str(&mut payload, ""); // languages s2c
    payload.push(0); // first_kex_packet_follows = false
    write_u32(&mut payload, 0); // reserved

    payload
}

/// 解析服务端 KEXINIT 的 payload。
pub fn parse_kexinit(payload: &[u8]) -> Result<KexInit> {
    let mut pos = 0usize;

    let msg = payload[pos];
    pos += 1;
    if msg != SSH_MSG_KEXINIT {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("expected KEXINIT (20), got {msg}"),
        ));
    }

    pos += 16; // 跳过 cookie

    let kex_algorithms = read_string_str_at(payload, &mut pos)?;
    let server_host_key_algorithms = read_string_str_at(payload, &mut pos)?;
    let encryption_c2s = read_string_str_at(payload, &mut pos)?;
    let encryption_s2c = read_string_str_at(payload, &mut pos)?;
    let mac_c2s = read_string_str_at(payload, &mut pos)?;
    let mac_s2c = read_string_str_at(payload, &mut pos)?;
    let compression_c2s = read_string_str_at(payload, &mut pos)?;
    let compression_s2c = read_string_str_at(payload, &mut pos)?;
    let languages_c2s = read_string_str_at(payload, &mut pos)?;
    let languages_s2c = read_string_str_at(payload, &mut pos)?;

    if pos >= payload.len() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "truncated KEXINIT",
        ));
    }
    let first_kex_packet_follows = payload[pos] != 0;

    Ok(KexInit {
        kex_algorithms,
        server_host_key_algorithms,
        encryption_c2s,
        encryption_s2c,
        mac_c2s,
        mac_s2c,
        compression_c2s,
        compression_s2c,
        languages_c2s,
        languages_s2c,
        first_kex_packet_follows,
    })
}
