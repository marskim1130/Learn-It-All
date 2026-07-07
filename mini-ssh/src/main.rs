mod kex;
mod ssh_string;
mod transport;

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;

fn main() -> std::io::Result<()> {
    let server_addr = "ssh.github.com:443";
    let client_version = "SSH-2.0-mini-ssh_0.1\r\n";

    // TcpStream 同时可读可写：clone 一份给读，原始给写。
    let stream = TcpStream::connect(server_addr)?;
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut writer = stream;

    println!("connected to {server_addr}");

    // 1. 版本协商
    writer.write_all(client_version.as_bytes())?;
    writer.flush()?;
    println!("sent: {}", client_version.trim_end());

    let mut server_version = String::new();
    reader.read_line(&mut server_version)?;
    println!("server version: {}", server_version.trim_end());

    // 2. 发送客户端 KEXINIT（明文包）
    let kexinit = kex::build_kexinit();
    transport::write_packet(&mut writer, &kexinit)?;
    println!("sent KEXINIT ({} bytes payload)", kexinit.len());

    // 3. 读取并解析服务端 KEXINIT
    let payload = transport::read_packet(&mut reader)?;
    let kex = kex::parse_kexinit(&payload)?;

    println!("--- Server KEXINIT ---");
    println!("kex algorithms:       {}", kex.kex_algorithms);
    println!("host key algorithms:  {}", kex.server_host_key_algorithms);
    println!("encryption c2s:       {}", kex.encryption_c2s);
    println!("encryption s2c:       {}", kex.encryption_s2c);
    println!("mac c2s:              {}", kex.mac_c2s);
    println!("mac s2c:              {}", kex.mac_s2c);
    println!("compression c2s:      {}", kex.compression_c2s);
    println!("compression s2c:      {}", kex.compression_s2c);

    Ok(())
}
