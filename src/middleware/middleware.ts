import minimist from 'minimist'
/*
 * @Description: 消息处理中间件
 * @Author: 14K
 * @Date: 2024-11-14 12:07:24
 * @LastEditTime: 2024-11-21 18:32:49
 * @LastEditors: 14K
 */
import type { AtElem, GroupMessageEvent, ImageElem, MessageElem, PrivateMessageEvent } from '@14kay/icqq-plus'
import type { ParsedArgs } from 'minimist'
import { getTargetType } from './../utils'
import { compose } from './compose'
import { MiddlewareError } from './error'
import type { CommandOptions } from './types'

export type Next = () => Promise<any>
export type TMiddleware<T> = (context: T, next: Next) => Promise<void> | void
type GroupedByType = Record<string, MessageElem[]>

export interface IMiddleware<T> {
	push: (...middlewares: TMiddleware<T>[]) => void
	use: (middleware: TMiddleware<T>) => void
	run: (context: T, callback: (data: ProcessedData) => any) => Promise<any>
}

export interface ProcessedData {
	at?: number[]
	atList?: number[]
	equal?: string
	text?: string
	imageList?: ImageElem[]
	blackWord?: string
	reg?: RegExpMatchArray
	group_id?: number
	sender?: number
	restText?: string
	command?: ParsedArgs
	type?: MessageTypeMap
	some?: MessageTypeMap
	hongbao?: MessageElem[]
}

export type MessageTypeMap = {
	[K in MessageElem['type']]?: Extract<MessageElem, { type: K }>[];
}

type Context<T> = T & { results: ProcessedData }

export class MessageMiddleware<T> implements IMiddleware<T> {
	stack: TMiddleware<T>[] = []

	static create<T>(...middlewares: TMiddleware<T>[]) {
		return new MessageMiddleware(...middlewares)
	}

	constructor(...middlewares: TMiddleware<T>[]) {
		this.stack = middlewares
	}

	public push(...middlewares: TMiddleware<T>[]) {
		this.stack.push(...middlewares)
		return this
	}

	public use(middleware: TMiddleware<T>) {
		this.stack.push(middleware)
	}

	public run(context: T, callback?: (data: ProcessedData) => any) {
		const ctx = context as Context<T>
		ctx.results = {}

		const fn = compose(this.stack)

		return fn(ctx as any).then((completed) => {
			// 只有当所有中间件都成功执行（completed === true）时才触发 callback
			if (completed && callback)
				return callback(ctx.results)
			if (completed)
				return ctx.results
			// 中间件链被中断（有中间件没有调用 next），返回空
			return undefined
		}).catch((err) => {
			throw new MiddlewareError(err.name || 'MiddlewareError', err.message)
		})
	}

	blackWords(words: string | string[]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { message } = ctx
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (Array.isArray(words) && words.includes(textMessage)) {
					throw new MiddlewareError('blackWords', 'Message contains black words')
				}
				if (typeof words === 'string' && textMessage === words) {
					throw new MiddlewareError('blackWords', 'Message contains black words')
				}
				ctx.results.blackWord = textMessage
				return next()
			} catch (e: any) {
				throw new MiddlewareError('blackWords', e.message)
			}
		})
		return this
	}

	at(uin: number | number[]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const uinList = Array.isArray(uin) ? uin : [uin]
				const { message } = ctx
				const atMessage = message.filter(msg =>
					msg.type === 'at' && msg.qq !== 'all' && uinList.includes(msg.qq),
				) as AtElem[]

				if (atMessage.length > 0) {
					const uniqueUins = [...new Set(atMessage.map(elem => elem.qq))]
					ctx.results.at = uniqueUins as number[]
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('at', e.message)
			}
		})
		return this
	}

	equal(text: string | string[]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { message } = ctx
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (Array.isArray(text)) {
					if (text.includes(textMessage)) {
						ctx.results.equal = textMessage
						return next()
					}
				}
				if (textMessage === text) {
					ctx.results.equal = textMessage
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('equal', e.message)
			}
		})
		return this
	}

	reg(reg: RegExp) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { message } = ctx
				const textMessage = getTargetType(message, 'text')
					.map(elem => elem.text.trim())
					.join('')

				const match = textMessage.match(reg) // 获取匹配结果
				if (match) {
					ctx.results.reg = match
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('reg', e.message)
			}
		})
		return this
	}

	group(groups: number[] | number) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & GroupMessageEvent
			try {
				const { group_id } = ctx
				if ((Array.isArray(groups) && groups.includes(group_id)) || groups === group_id) {
					ctx.results.group_id = group_id
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('group', e.message)
			}
		})
		return this
	}

	hongbao() {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { message } = ctx
				const hongbaoMessage = getTargetType(message, 'hongbao')
				if (hongbaoMessage.length !== 0) {
					ctx.results.hongbao = hongbaoMessage
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('hongbao', e.message)
			}
		})
		return this
	}

	sender(uin: number | number[]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { sender } = ctx
				if (!Array.isArray(uin)) {
					uin = [uin]
				}
				if (uin.includes(sender.user_id)) {
					ctx.results.sender = sender.user_id
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('sender', e.message)
			}
		})

		return this
	}

	getImage() {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			const { message } = ctx
			const imageMessage = getTargetType(message, 'image')
			if (imageMessage.length !== 0) {
				ctx.results.imageList = imageMessage
				return next()
			}
			ctx.results.imageList = []
			return next()
		})
		return this
	}

	getText() {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			const { message } = ctx
			const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
			ctx.results.text = textMessage || ''
			return next()
		})
		return this
	}

	getAt() {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			const { message } = ctx
			const atMessage = getTargetType(message, 'at')
			if (atMessage.length !== 0) {
				const atUin = atMessage.filter(elem => elem.qq !== 'all').map(elem => elem.qq)
				ctx.results.atList = atUin as number[]
				return next()
			}
			ctx.results.atList = []
			return next()
		})
		return this
	}

	startsWith(prefix: string | string[]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				if (!Array.isArray(prefix)) {
					prefix = [prefix]
				}
				const { message } = ctx
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')

				const matchedPrefix = prefix.find(pre => textMessage.startsWith(pre))

				if (matchedPrefix) {
					ctx.results.restText = textMessage.slice(matchedPrefix.length).trim()
					return next()
				}
			} catch (e: any) {
				throw new MiddlewareError('startsWith', e.message)
			}
		})
		return this
	}

	/**
  * @description: 检查消息是否只有指定类型
  * @param {string} types
  * @param {Next} callback
  * @return {*}
  */
	type(types: MessageElem['type'] | MessageElem['type'][]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = ctx
				// 获取消息中的所有类型
				const messageTypes = message.map((elem: MessageElem) => elem.type)
				// 确保消息中的每个类型都在指定类型中，且消息没有多余的类型
				const messageTypeCheckResult = messageTypes.every(type => types.includes(type)) && types.every(type => messageTypes.includes(type))

				if (messageTypeCheckResult) {
					const messageTypeMap = this.groupByType(message, types)
					ctx.results.type = messageTypeMap
					return next()
				}
				throw new MiddlewareError('messageType', `Message type not match. Expected: ${types.join(', ')}, but got: ${messageTypes.join(', ')}`)
			} catch (e: any) {
				throw new MiddlewareError('messageType', e.message)
			}
		})
		return this
	}

	/**
	 * @description: 检查消息是否包含指定类型
	 * @param {string} types
	 * @return {*}
	 */
	some(types: MessageElem['type'] | MessageElem['type'][]) {
		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = ctx
				const messageTypeCheckResult = Array.from(new Set(types)).every((type) => {
					return message.some((elem: MessageElem) => elem.type === type)
				})
				if (messageTypeCheckResult) {
					const someMessageTypeMap = this.groupByType(message, types)
					ctx.results.some = someMessageTypeMap
					return next()
				}
				throw new MiddlewareError('messageType', 'Message type not match')
			} catch (e: any) {
				throw new MiddlewareError('messageType', e.message)
			}
		})
		return this
	}

	command(option: CommandOptions | CommandOptions[]) {
		if (!(Array.isArray(option))) {
			option = [option]
		}
		// 明确告诉 TypeScript option 现在是数组
		const options: CommandOptions[] = option

		this.stack.push((context, next) => {
			const ctx = context as Context<T> & (GroupMessageEvent | PrivateMessageEvent)
			try {
				const { message } = ctx
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				const args = minimist(textMessage.split(/\s+/))
				if (args.help) {
					const helpMessage = options.map((opt) => {
						const { command, alias, description, required, type, defaultValue } = opt
						return `-${alias}, --${command}: ${description} ${required ? '(required)' : ''} ${type ? `(${type})` : ''} ${defaultValue ? `(default: ${defaultValue})` : ''}`
					}).join('\n')
					throw new MiddlewareError('command', helpMessage)
				}
				const checkPassed = options.every((opt) => {
					const { command, alias, required, type, defaultValue } = opt
					args[command] ||= args[alias]
					args[alias] ||= args[command]
					if (required) {
						if (!args[command] && !args[alias]) {
							if (!defaultValue) {
								throw new MiddlewareError('command', `Missing required argument: ${command}`)
							}

							args[command] = args[alias] = defaultValue
						}

						const value = (args[command] || args[alias]) as string

						const checkType = (value: any, expectedType: string, command: string) => {
							if (typeof value !== expectedType) {
								throw new MiddlewareError('command', `Expected type of ${command} is ${expectedType}, but got ${typeof value}`)
							}
							return true
						}

						if (type) {
							switch (type) {
								case 'string':
									return checkType(value, 'string', command)
								case 'number':
									return checkType(value, 'number', command)
								case 'boolean':
									return checkType(value, 'boolean', command)
								case 'array':
									if (!Array.isArray(value)) {
										throw new MiddlewareError('command', `Expected type of ${command} is array, but got ${typeof value}`)
									}
									return true
								case 'object':
									if (typeof value !== 'object' || value === null || Array.isArray(value)) {
										throw new MiddlewareError('command', `Expected type of ${command} is object, but got ${typeof value}`)
									}
									return true
								default:
									return false
							}
						}
					}

					return true
				})

				if (checkPassed) {
					ctx.results.command = args
					return next()
				}
			} catch (e: any) {
				// callback && callback(e.message)
				throw new MiddlewareError('command', e.message)
			}
		})
		return this
	}

	groupByType(messages: MessageElem[], types: MessageElem['type'][]): GroupedByType {
		const grouped: GroupedByType = {}

		for (const message of messages) {
			const { type } = message
			if (!types.includes(type))
				continue
			if (!grouped[type]) {
				grouped[type] = []
			}
			grouped[type].push(message)
		}

		return grouped
	}
}
