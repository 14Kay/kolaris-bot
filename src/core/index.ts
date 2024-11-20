/*
 * @Description: Kolaris
 * @Author: 14K
 * @Date: 2024-11-14 23:32:56
 * @LastEditTime: 2024-11-20 17:37:30
 * @LastEditors: 14K
 */

import type { Buffer } from 'node:buffer'
import type { Plugin } from './../plugin'
import type { KolarisConfig, PluginJson } from './types'
import path from 'node:path'
import process from 'node:process'
import { Client } from '@icqq-plus/icqq'
import fsExtra from 'fs-extra'
import { Mysql } from './../mysql'
import { KolarisError } from './../utils'
import { online } from './online'

export class Kolaris extends Client {
	pluginActivedMap: Map<string, Plugin> = new Map()
	/* 插件目录 */
	pluginDir: string = ''
	/* 插件信息 用于记录 并在bot重启后重载 */
	pluginFilePath: string = path.resolve(process.cwd(), 'plugin.json')
	/* BOT启用的插件列表 */
	pluginList: PluginJson = {
		enabled: [],
		error: [],
		actived: [],
	}

	mysql: Mysql | null = null
	runAt: number = Date.now()
	constructor(protected kolarisConfig: KolarisConfig) {
		const { config, uin, pluginDir, mysqlConfig } = kolarisConfig
		super(uin, config)
		if (!fsExtra.pathExistsSync(this.pluginFilePath)) {
			fsExtra.ensureFileSync(this.pluginFilePath)
			this.savePluginFile()
		}
		this.pluginList = fsExtra.readJSONSync(this.pluginFilePath)
		this.pluginDir = path.resolve(process.cwd(), pluginDir || 'plugins')
		if (mysqlConfig) {
			this.mysql = new Mysql(mysqlConfig)
		}
	}

	sendMessage2Masters(message: string) {
		if (!this.kolarisConfig.master)
			throw new KolarisError('You dont provide master uin')
		if (Array.isArray(this.kolarisConfig.master)) {
			this.kolarisConfig.master.forEach((uin) => {
				this.sendPrivateMsg(uin, message)
			})
			return
		}
		this.sendPrivateMsg(this.kolarisConfig.master, message)
	}

	// 保存插件列表到plugin.json
	savePluginFile() {
		return fsExtra.writeJsonSync(this.pluginFilePath, this.pluginList)
	}

	// 保存单个插件的配置到package.json
	savePluginConfig() {
		for (const [name, plugin] of this.pluginActivedMap) {
			const pkg = path.join(this.pluginDir, name, 'package.json')
			if (fsExtra.pathExistsSync(pkg)) {
				fsExtra.writeJsonSync(pkg, plugin.config, { spaces: 2 })
			}
		}
	}

	initListener() {
		this.on('system.login.slider', () => {
			const listenInput = () => {
				process.stdin.once('data', (data: Buffer) => {
					const ticket = String(data).trim()
					if (!ticket)
						listenInput()
					this.submitSlider(ticket)
				})
			}
			listenInput()
		})

		this.on('system.login.qrcode', () => {
			process.stdin.once('data', () => {
				this.login()
			})
		})

		process.on('SIGINT', () => {
			this.log('Kolaris is shutting down...', 'warn')
			this.savePluginFile()
			this.savePluginConfig()
			process.exit()
		})
	}

	log(message: string, type: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'mark' | 'trace' = 'info') {
		this.logger[type](`${this.kolarisConfig.logPrefix || 'Kolaris'} - ${message}`)
		return `${this.kolarisConfig.logPrefix || 'Kolaris'} - ${message}`
	}

	start() {
		this.login(this.kolarisConfig.password || undefined)
		this.once('system.online', online.bind(this))
		this.initListener()
	}

	async wait(time: number) {
		return new Promise(resolve => setTimeout(() => resolve(true), time))
	}

	randomFrom(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1) + min)
	}
}
