/*
 * @Description: 消息处理中间件
 * @Author: 14K
 * @Date: 2024-11-14 12:07:24
 * @LastEditTime: 2024-11-19 19:52:35
 * @LastEditors: 14K
 */
import type { AtElem, GroupMessageEvent, ImageElem, MessageElem, PrivateMessageEvent } from '@icqq-plus/icqq'
import type { ParsedArgs } from 'minimist'
import type { CommandOptions } from './types'
import minimist from 'minimist'
import { getTargetType } from './../utils'
import { MiddlewareError } from './error'

export type Next = <K extends keyof ProcessedData>(key: K, data?: ProcessedData[K]) => Promise<any> | any
type TMiddleware<T> = (context: T, next: Next) => Promise<void> | void
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
}

export type MessageTypeMap = {
	[K in MessageElem['type']]?: Extract<MessageElem, { type: K }>[];
}

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
		const index = 0
		const data: ProcessedData = {}
		const runner = async (index: number): Promise<any> => {
			if (index === this.stack.length) {
				if (callback)
					await callback(data)
				return
			}

			const middleware = this.stack[index]
			try {
				await middleware(context, (key, response) => {
					data[key] = response
					runner(index + 1)
				})
			} catch (err: any) {
				throw new MiddlewareError(err.name, err.message)
			}
		}

		return runner(index)
	}

	blackWords(words: string | string[]) {
		this.stack.push((context, next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (Array.isArray(words) && words.some(word => textMessage.includes(word))) {
					throw new MiddlewareError('blackWords', 'Message contains black words')
				}
				if (typeof words === 'string' && textMessage.includes(words)) {
					throw new MiddlewareError('blackWords', 'Message contains black words')
				}
				return next('blackWord', textMessage)
			} catch (e: any) {
				throw new MiddlewareError('blackWords', e.message)
			}
		})
		return this
	}

	at(uin: number | number[]) {
		this.stack.push((context, next) => {
			try {
				const uinList = Array.isArray(uin) ? uin : [uin]
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const atMessage = message.filter(msg =>
					msg.type === 'at' && msg.qq !== 'all' && uinList.includes(msg.qq),
				) as AtElem[]

				if (atMessage.length > 0) {
					const uniqueUins = [...new Set(atMessage.map(elem => elem.qq))]
					return next('at', uniqueUins as number[])
				}
			} catch (e: any) {
				throw new MiddlewareError('at', e.message)
			}
		})
		return this
	}

	equal(text: string | string[]) {
		this.stack.push((context, next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (Array.isArray(text)) {
					if (text.includes(textMessage)) {
						return next('equal', textMessage)
					}
				}
				if (textMessage === text) {
					return next('equal', textMessage)
				}
			} catch (e: any) {
				throw new MiddlewareError('equal', e.message)
			}
		})
		return this
	}

	reg(reg: RegExp) {
		this.stack.push((context, next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text')
					.map(elem => elem.text.trim())
					.join('')

				const match = textMessage.match(reg) // 获取匹配结果
				if (match) {
					return next('reg', match)
				}
			} catch (e: any) {
				throw new MiddlewareError('reg', e.message)
			}
		})
		return this
	}

	group(groups: number[] | number) {
		this.stack.push((context, next) => {
			try {
				const { group_id } = context as GroupMessageEvent
				if ((Array.isArray(groups) && groups.includes(group_id)) || groups === group_id) {
					return next('group_id', group_id)
				}
			} catch (e: any) {
				throw new MiddlewareError('group', e.message)
			}
		})
		return this
	}

	sender(uin: number | number[]) {
		this.stack.push((context, next) => {
			try {
				const { sender } = context as GroupMessageEvent | PrivateMessageEvent
				if (!Array.isArray(uin)) {
					uin = [uin]
				}
				if (uin.includes(sender.user_id)) {
					return next('sender', sender.user_id)
				}
			} catch (e: any) {
				throw new MiddlewareError('sender', e.message)
			}
		})

		return this
	}

	getImage() {
		this.stack.push((context, next) => {
			const { message } = context as GroupMessageEvent | PrivateMessageEvent
			const imageMessage = getTargetType(message, 'image')
			if (imageMessage.length !== 0) {
				return next('imageList', imageMessage)
			}
			return next('imageList', [])
		})
		return this
	}

	getText() {
		this.stack.push((context, next) => {
			const { message } = context as GroupMessageEvent | PrivateMessageEvent
			const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
			return next('text', textMessage || '')
		})
		return this
	}

	getAt() {
		this.stack.push((context, next) => {
			const { message } = context as GroupMessageEvent | PrivateMessageEvent
			const atMessage = getTargetType(message, 'at')
			if (atMessage.length !== 0) {
				const atUin = atMessage.filter(elem => elem.qq !== 'all').map(elem => elem.qq)
				return next('atList', atUin as number[])
			}
			return next('atList', [])
		})
		return this
	}

	startsWith(prefix: string) {
		this.stack.push((context, next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (textMessage.startsWith(prefix)) {
					return next('restText', textMessage.slice(prefix.length).trim())
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
	type(types: MessageElem['type'] | MessageElem['type'][], callback?: Next) {
		this.stack.push((context, next) => {
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				// 获取消息中的所有类型
				const messageTypes = message.map((elem: MessageElem) => elem.type)
				// 确保消息中的每个类型都在指定类型中，且消息没有多余的类型
				const messageTypeCheckResult = messageTypes.every(type => types.includes(type)) && types.every(type => messageTypes.includes(type))

				if (messageTypeCheckResult) {
					const messageTypeMap = this.groupByType(message, types)
					return next('type', messageTypeMap)
				}
				throw new MiddlewareError('messageType', `Message type not match. Expected: ${types.join(', ')}, but got: ${messageTypes.join(', ')}`)
			} catch (e: any) {
				callback && callback(e.message)
				throw new MiddlewareError('messageType', e.message)
			}
		})
		return this
	}

	/**
	 * @description: 检查消息是否包含指定类型
	 * @param {string} types
	 * @param {Next} callback
	 * @return {*}
	 */
	some(types: MessageElem['type'] | MessageElem['type'][], callback?: Next) {
		this.stack.push((context, next) => {
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const messageTypeCheckResult = Array.from(new Set(types)).every((type) => {
					return message.some((elem: MessageElem) => elem.type === type)
				})
				if (messageTypeCheckResult) {
					const someMessageTypeMap = this.groupByType(message, types)
					return next('some', someMessageTypeMap)
				}
				throw new MiddlewareError('messageType', 'Message type not match')
			} catch (e: any) {
				callback && callback(e.message)
				throw new MiddlewareError('messageType', e.message)
			}
		})
		return this
	}

	command(option: CommandOptions | CommandOptions[], callback?: Next) {
		if (!(Array.isArray(option))) {
			option = [option]
		}
		this.stack.push((context, next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				const args = minimist(textMessage.split(/\s+/))
				if (args.help) {
					const helpMessage = option.map((opt) => {
						const { command, alias, description, required, type, defaultValue } = opt
						return `-${alias}, --${command}: ${description} ${required ? '(required)' : ''} ${type ? `(${type})` : ''} ${defaultValue ? `(default: ${defaultValue})` : ''}`
					}).join('\n')
					throw new MiddlewareError('command', helpMessage)
				}
				const checkPassed = option.every((opt) => {
					const { command, alias, required, type, defaultValue } = opt
					if (required) {
						if (!args[command] && !args[alias]) {
							if (!defaultValue) {
								throw new MiddlewareError('command', `Missing required argument: ${command}`)
							}

							args[command] = args[alias] = defaultValue
						}
						args[command] ||= args[alias]
						args[alias] ||= args[command]
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

				if (checkPassed)
					return next('command', args)
			} catch (e: any) {
				callback && callback(e.message)
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
