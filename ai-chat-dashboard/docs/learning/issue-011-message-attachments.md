# Issue 011：消息文本附件学习记录

## 为什么 [Why]

用户常需要把笔记/Markdown 作为上下文发给模型。附件必须校验类型与大小，数据库只存元数据，正文进入模型上下文；上传失败时不应拖垮纯文本发送路径。

## 是什么 [What]

- `POST /conversations/:id/messages` 支持 `multipart/form-data`（兼容 JSON）。
- 允许 `.txt` / `.md`，最大 1 MB，每条消息最多 1 个文件。
- 用户消息 content 合并说明与附件正文。
- 公开字段 `attachment: { fileName, mimeType, sizeBytes } | null`。
- 不返回本地路径，不提供文件下载 API。

## 怎么做 [How]

1. 检测 `content-type` 是否 multipart。
2. 手写 boundary 解析字段与文件（教学向，无额外插件）。
3. `parseTextAttachment` 校验扩展名/大小并解码 UTF-8。
4. `mergeMessageContentWithAttachment` 生成模型上下文。
5. 消息表保存附件元数据列。

## 完整示例 [Complete Example]

```powershell
# multipart 可用 curl 或 Demo 页
# content + file=notes.md
```

常见错误：

- 把文件二进制直接塞进数据库。
- 允许任意 MIME，导致 XSS/存储炸弹。
- 附件失败时连纯文本也拒绝（本切片：非法附件直接 400；无附件时 JSON 路径不受影响）。
