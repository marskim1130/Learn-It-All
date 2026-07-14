import { ChatPerformanceLab } from "../../components/chat-performance-lab";

export default function ChatPage() {
  return (
    <main style={{ padding: 24 }}>
      <ChatPerformanceLab />
      <p style={{ marginTop: 24 }}>
        <a href="/">返回健康检查页</a>
      </p>
    </main>
  );
}
