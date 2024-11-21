<!--
 * @Description:
 * @Author: 14K
 * @Date: 2024-11-13 12:55:10
 * @LastEditTime: 2024-11-21 21:04:25
 * @LastEditors: 14K
-->
# kolaris-bot

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]

## Usage

```typescript
import { Kolaris } from 'kolaris-bot'

new Kolaris({
	uin: 619113277,
	// 私聊管理插件启、停的指令
	command: 'plug',
	// 插件存储目录
	pluginDir: 'plugins',
	master: [619113277],
	config: {
		platform: 5,
		ver: '9.0.56',
		sign_api_addr: xxx,
		ignore_self: false,
	},
}).start()
```
## 插件写法

```typescript
import { defineBotPlugin, MessageMiddleware, Plugin } from 'kolaris-bot'

export default defineBotPlugin({
	setup: (client, config) => {
		const plugin = new Plugin(client, config)
		plugin.onGroupMessage(
			(data: GroupMessageEvent) => {
				// 使用消息处理中间件
				new MessageMiddleware<GroupMessageEvent>()
					.startsWith('查信息')
					.equal()
					.getAt()
					.getText()
				// 还有更多...
					.run(data, async ({ atList, restText }) => {
						// logic here
					})

				// OR your code
			},
		)
		return plugin
	},
})
```
> Note：插件目前仅支持 commonjs 并不支持esm

## License

[MIT](./LICENSE) License © 2024-PRESENT [14K](https://github.com/14Kay)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@14kay/kolaris-bot?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/@14kay/kolaris-bot
[npm-downloads-src]: https://img.shields.io/npm/dm/@14kay/kolaris-bot?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/@14kay/kolaris-bot
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@14kay/kolaris-bot?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=@14kay/kolaris-bot
[license-src]: https://img.shields.io/github/license/antfu/@14kay/kolaris-bot.svg?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/@14kay/kolaris-bot
