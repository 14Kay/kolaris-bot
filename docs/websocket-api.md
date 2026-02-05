# WebSocket API 使用指南

## 快速开始

Plugin 类现在提供了 WebSocket 服务器支持，使用方式与 HTTP API 类似。

### 基本用法

```typescript
import { defineBotPlugin, Plugin } from 'kolaris-bot'

export default defineBotPlugin({
	setup: (client, config) => {
		const plugin = new Plugin(client, config)

		// 创建 WebSocket 服务器
		plugin.ws(3001, (ws, req) => {
			console.log('新客户端连接')

			// 监听消息
			ws.on('message', (data) => {
				console.log('收到:', data.toString())

				// 发送回复
				ws.send(JSON.stringify({
					type: 'echo',
					data: data.toString()
				}))
			})

			// 连接关闭
			ws.on('close', () => {
				console.log('客户端断开')
			})

			// 错误处理
			ws.on('error', (err) => {
				console.error('WebSocket 错误:', err)
			})
		})

		return plugin
	}
})
```

### OpenClaw 适配器示例

使用 WebSocket 实现 OpenClaw 双向通信：

```typescript
plugin.ws(3001, (ws, req) => {
	// 存储连接
	openclawConnection = ws

	ws.on('message', (data) => {
		const message = JSON.parse(data.toString())

		// OpenClaw 发送消息到 QQ
		if (message.type === 'send_qq') {
			client.pickGroup(message.target_id)
				.sendMsg(message.content)
		}
	})

	// QQ 消息转发到 OpenClaw
	plugin.onGroupMessage((event) => {
		if (openclawConnection) {
			openclawConnection.send(JSON.stringify({
				type: 'qq_message',
				content: event.raw_message,
				sender: event.sender.user_id
			}))
		}
	})
})
```

## API 参考

### `plugin.ws(port, handler, options?)`

创建 WebSocket 服务器。

- **port**: `number` - 监听端口
- **handler**: `(ws: WebSocket, req: any) => any` - 连接处理函数
- **options**: `Partial<ServerOptions>` - ws 库的配置选项

### `plugin.stopWs(port)`

停止指定端口的 WebSocket 服务器。

## 注意事项

1. **自动清理**: 插件卸载时会自动关闭所有 WebSocket 连接
2. **端口冲突**: 每个端口只能创建一个 WebSocket 服务器
3. **错误处理**: 建议总是监听 `error` 事件避免崩溃
