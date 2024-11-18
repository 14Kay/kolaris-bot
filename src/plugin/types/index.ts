/*
 * @Description:
 * @Author: 14K
 * @Date: 2024-11-14 22:15:39
 * @LastEditTime: 2024-11-18 15:26:57
 * @LastEditors: 14K
 */
import type { Kolaris } from './../../core'
import type { Plugin } from './../index'

export interface PluginConfig {
	name?: string
	type?: 'module' | 'commonjs'
	version?: string
	description?: string
	quote?: boolean
	blackGroups?: number[]
	blackUsers?: number[]
	[key: string]: any
}

export interface BotPlugin {
	setup: (ctx: Kolaris, pluginConfig?: PluginConfig) => Plugin
}
