import type { BotPlugin } from './../src/plugin/types'

export * from './core'
export * from './middleware'
export * from './plugin'
export interface PluginOptions extends Record<string, any> {}

export function defineBotPlugin<T extends PluginOptions = PluginOptions>(botPlugin: BotPlugin | ((options: T) => BotPlugin)) {
	return botPlugin
}
