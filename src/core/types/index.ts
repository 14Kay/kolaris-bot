import type { Config } from '@icqq-plus/icqq'
import type { PoolConfig } from 'mysql'
import type { PluginConfig } from './../../plugin/types'

export interface PluginInfo {
	name: string
	info: PluginConfig
}

// 保存的插件启停状态
export interface PluginJson {
	// 启用的插件包括了 error 和 actived
	enabled: string[]
	// 启用时出错的插件
	error: string[]
	// 加载成功的
	actived: string[]
}

export interface KolarisConfig {
	/* icqq配置项 */
	config: Config
	uin: number
	/* 管理bot的前缀（仅私聊有效） */
	command: string
	password?: string
	/* 插件目录（相对路径） */
	pluginDir?: string
	/* bot主人 */
	master?: number[] | number
	logPrefix?: string
	mysqlConfig?: PoolConfig
}
