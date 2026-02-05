import Koa from 'koa'
import koaBodyParser from 'koa-bodyparser'
import KoaRouter from 'koa-router'
import * as nodeCron from 'node-cron'
import { WebSocketServer } from 'ws'
/*
 * @Description: 插件系统
 * @Author: 14K
 * @Date: 2024-11-14 14:56:37
 * @LastEditTime: 2024-11-21 21:41:28
 * @LastEditors: 14K
 */
import type { Client, EventMap, GroupMessageEvent, PrivateMessageEvent, Sendable } from '@14kay/icqq-plus'
import type { DatabaseOptions } from 'classic-level'
import type { Server as HttpServer } from 'node:http'
import type { ScheduledTask } from 'node-cron'
import type { ServerOptions, WebSocket } from 'ws'
import { PluginError } from './../utils'
import { Database } from './leveldb'
import type { Kolaris } from './../core/index'
import type { PluginConfig } from './types'

export type HttpHandler = (router: KoaRouter) => any
export type WebSocketHandler = (ws: WebSocket, req: any) => any
type Func = (...args: any[]) => any
export class Plugin {
	private handlers: Map<string, Func[]> = new Map()
	private httpServer: Map<string, HttpServer> = new Map()
	private wsServers: Map<string, WebSocketServer> = new Map()
	private dbMap: Map<string, Database<any>> = new Map()
	private cronTasks: ScheduledTask[] = []

	// 限制对 client 的直接访问，鼓励使用封装好的 API
	constructor(protected client: Kolaris, public config: PluginConfig = {}, private cb?: () => any) {
		client.logger.info(`KolarisPlugin - 插件实例化成功: ${config.name}`)
	}

	on<T extends keyof EventMap>(event: T, listener: EventMap[T]) {
		this.client.on(event, listener)
		this.addListener(event, listener)
		return this
	}

	private onMessage(eventType: 'group' | 'private', callback: (data: any) => void) {
		const handler = (data: PrivateMessageEvent | GroupMessageEvent) => {
			if (this.checkStatus(data) || this.checkMaster(data.sender.user_id)) {
				if (eventType === 'group') {
					const event = data as GroupMessageEvent
					const reply = (content: Sendable, quote?: boolean) => {
						const shouldQuote = quote !== undefined ? quote : this.config.quote
						return event.group.sendMsg(content, shouldQuote ? event : undefined)
					}
					return callback({ ...data, reply })
				}
				return callback(data)
			}
		}
		this.client.on(`message.${eventType}`, handler)
		this.addListener(`message.${eventType}`, handler)
		return this
	}

	onGroupMessage(callback: (data: GroupMessageEvent) => any) {
		return this.onMessage('group', callback)
	}

	onPrivateMessage(callback: (data: PrivateMessageEvent) => any) {
		return this.onMessage('private', callback)
	}

	private checkStatus(event: PrivateMessageEvent | GroupMessageEvent): boolean {
		if (event.message_type === 'private') {
			return this.checkUser(event.sender.user_id)
		}
		return this.checkUser(event.sender.user_id) && this.checkGroup(event.group_id)
	}

	private checkUser(userId: number): boolean {
		return !this.config.blackUsers?.includes(userId)
	}

	private checkGroup(groupId: number): boolean {
		return !this.config.blackGroups?.includes(groupId)
	}

	private checkMaster(userId: number): boolean {
		const masters = this.client.kolarisConfig.master
		if (!masters)
			return false

		return typeof masters === 'number'
			? userId === masters
			: Array.isArray(masters) && masters.includes(userId)
	}

	checkPrefix(message: string): boolean {
		return message.startsWith(this.config.prefix || '')
	}

	cron(cronExpression: string, fn: (client: Client) => any): ScheduledTask {
		const isSytaxOK = nodeCron.validate(cronExpression)
		if (!isSytaxOK) {
			throw new PluginError('cron', '无效的 cron 表达式')
		}
		const task = nodeCron.schedule(cronExpression, () => fn(this.client))
		this.cronTasks.push(task)
		return task
	}

	clearCronTasks() {
		this.cronTasks.forEach(task => task.stop())
	}

	http(port: number, fn: HttpHandler) {
		if (this.httpServer.has(port.toString())) {
			this.client.logger.warn(`KolarisPlugin - HTTP服务`, `HTTP服务已在端口：${port} 运行`)
			throw new PluginError(this.config.name, 'HTTP服务已在端口运行')
		}
		const server = this.startHttp(port, fn)
		return this.httpServer.set(port.toString(), server)
	}

	startHttp(port: number, fn: HttpHandler) {
		const app = new Koa()
		const router = new KoaRouter()
		app.use(koaBodyParser())
		app.use(router.routes())
		const server = app.listen(port, () => {
			this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已启动，端口：${port}`)
			fn(router)
		})

		server.on('error', (err) => {
			this.client.logger.error(`KolarisPlugin - HTTP服务`, `端口：${port} 的HTTP服务发生错误：${err.message}`)
		})

		return server
	}

	stopHttp(port: number) {
		const server = this.httpServer.get(port.toString())
		if (!server) {
			this.client.logger.warn(`KolarisPlugin - HTTP服务`, `未找到端口：${port} 的HTTP服务`)
			throw new PluginError(this.config.name, '未找到HTTP服务')
		}

		server.close(() => this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已关闭，端口：${port}`))
	}

	/**
	 * 创建 WebSocket 服务器
	 * @param port 端口号
	 * @param handler WebSocket 连接处理函数
	 * @param options WebSocket 服务器选项（可选）
	 */
	ws(port: number, handler: WebSocketHandler, options?: Partial<ServerOptions>) {
		if (this.wsServers.has(port.toString())) {
			this.client.logger.warn(`KolarisPlugin - WebSocket服务`, `WebSocket服务已在端口：${port} 运行`)
			throw new PluginError(this.config.name, 'WebSocket服务已在端口运行')
		}

		const wss = new WebSocketServer({ port, ...options })

		wss.on('connection', (ws: WebSocket, req: any) => {
			this.client.logger.info(`KolarisPlugin - WebSocket`, `新连接建立，端口：${port}`)
			handler(ws, req)
		})

		wss.on('error', (err: Error) => {
			this.client.logger.error(`KolarisPlugin - WebSocket`, `端口：${port} 的WebSocket服务发生错误：${err.message}`)
		})

		wss.on('listening', () => {
			this.client.logger.info(`KolarisPlugin - WebSocket服务`, `WebSocket服务已启动，端口：${port}`)
		})

		this.wsServers.set(port.toString(), wss)
		return this
	}

	/**
	 * 停止指定端口的 WebSocket 服务器
	 */
	stopWs(port: number) {
		const wss = this.wsServers.get(port.toString())
		if (!wss) {
			this.client.logger.warn(`KolarisPlugin - WebSocket服务`, `未找到端口：${port} 的WebSocket服务`)
			throw new PluginError(this.config.name, '未找到WebSocket服务')
		}

		wss.close(() => {
			this.client.logger.info(`KolarisPlugin - WebSocket服务`, `WebSocket服务已关闭，端口：${port}`)
		})
		this.wsServers.delete(port.toString())
	}

	/**
	 * 停止所有 WebSocket 服务器
	 */
	private stopAllWebSocketServers() {
		for (const [port, wss] of this.wsServers) {
			wss.close(() => {
				this.client.logger.info(`KolarisPlugin - WebSocket服务`, `WebSocket服务已关闭，端口：${port}`)
			})
		}
		this.wsServers.clear()
	}

	getLevelDB<T = Record<string, string>>(location: string) {
		if (!this.dbMap.has(location))
			throw new PluginError(this.config.name, `数据库${location}不存在`)
		return this.dbMap.get(location) as Database<T>
	}

	levelDB<T = Record<string, string>>(location: string, options?: DatabaseOptions<keyof T, T[keyof T]>) {
		if (this.dbMap.has(location))
			throw new PluginError(this.config.name, `数据库${location}已存在`)
		const db = new Database<T>(location, options)
		this.dbMap.set(location, db)
		return db
	}

	closeAllLevelDB() {
		for (const [location, db] of this.dbMap) {
			db.close()
			this.dbMap.delete(location)
		}
	}

	closeLevelDB(location: string) {
		const db = this.dbMap.get(location)
		if (!db) {
			this.client.logger.warn(`KolarisPlugin - LevelDB`, `未找到数据库：${location}`)
			throw new PluginError(this.config.name, '未找到数据库')
		}
		db.close()
		this.dbMap.delete(location)
	}

	private stopAllHttpServer() {
		for (const [eventName, handlers] of this.httpServer) {
			handlers.close(() => this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已关闭，端口：${eventName}`))
		}
	}

	private addListener(eventName: string, handler: Func) {
		const handlers = this.handlers.get(eventName)
		this.handlers.set(eventName, handlers ? [...handlers, handler] : [handler])
	}

	private removeListeners() {
		for (const [key, handlers] of this.handlers) {
			handlers.forEach((handler) => {
				// 尝试使用 offTrap，如果不存在则回退到 off/removeListener
				if (typeof this.client.offTrap === 'function') {
					this.client.offTrap(key, handler)
				} else {
					// 强制转换以兼容 icqq-plus 可能的非标准类型定义
					(this.client as any).removeListener(key, handler)
				}
			})
		}
	}

	destroy() {
		try {
			this.removeListeners()
			this.stopAllHttpServer()
			this.stopAllWebSocketServers()
			this.closeAllLevelDB()
			this.clearCronTasks()
			if (this.cb)
				this.cb()
			this.client.logger.mark(`KolarisPlugin - 插件 ${this.config.name} 已卸载`)
		} catch (e: any) {
			this.client.logger.error(`KolarisPlugin - 卸载插件 ${this.config.name} 时发生错误: ${e.message}`)
		}
	}
}
