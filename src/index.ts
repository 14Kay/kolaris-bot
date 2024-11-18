import type { BotPlugin } from './../src/plugin/types'

export * from './core'
export * from './middleware'
export * from './plugin'
export interface PluginOptions {}
export function defineBotPlugin<T = PluginOptions>(botPlugin: BotPlugin) {
	return botPlugin as T extends PluginOptions ? (options: T) => BotPlugin : BotPlugin
}
