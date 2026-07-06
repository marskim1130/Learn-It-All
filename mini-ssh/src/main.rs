use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;

fn send_client_version(stream: &mut TcpStream, client_version: &str) {
    stream.write_all(client_version.as_bytes()).unwrap();
}

fn read_server_version(reader: &mut BufReader<TcpStream>) -> String {
    let mut server_version = String::new();

    reader.read_line(&mut server_version).unwrap();

    server_version
}

fn main() {
    let server_addr = "ssh.github.com:443";
    let client_version: &str = "SSH-2.0-mini-ssh_0.1\r\n";

    match TcpStream::connect(server_addr) {
        Ok(mut stream) => {
            println!("connected to {}", server_addr);

            send_client_version(&mut stream, client_version);
            println!("sent: {}", client_version.trim_end());

            let mut reader = BufReader::new(stream);

            let server_version = read_server_version(&mut reader);

            println!("server version: {}", server_version.trim_end());
        }
        Err(error) => {
            println!("failed to connect: {}", error);
        }
    }
}
