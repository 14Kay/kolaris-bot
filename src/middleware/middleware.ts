/*
 * @Description: 消息处理中间件
 * @Author: 14K
 * @Date: 2024-11-14 12:07:24
 * @LastEditTime: 2024-11-18 16:25:02
 * @LastEditors: 14K
 */
import type { GroupMessageEvent, MessageElem, PrivateMessageEvent } from '@icqq-plus/icqq'
import type { CommandOptions } from './types'
import minimist from 'minimist'
import { getTargetType } from './../utils'
import { MiddlewareError } from './error'

export type Next = (data?: any) => Promise<any> | any
type TMiddleware<T> = (context: T, next: Next) => Promise<void> | void

export interface IMiddleware<T> {
	push: (...middlewares: TMiddleware<T>[]) => void
	use: (middleware: TMiddleware<T>) => void
	run: (context: T, callback: Next) => Promise<any>
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

	public run(context: T, callback?: Next) {
		const index = 0
		const data: any[] = []
		const runner = async (index: number): Promise<any> => {
			if (index === this.stack.length) {
				if (callback)
					await callback(data)
				return
			}

			const middleware = this.stack[index]
			try {
				await middleware(context, (res) => {
					data.push(res || '')
					runner(index + 1)
				})
			} catch (err: any) {
				throw new MiddlewareError(err.name, err.message)
			}
		}

		return runner(index)
	}

	at(uin: number) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const atMessage = message.filter(message => message.type === 'at' && message.qq === uin)
				if (atMessage.length !== 0) {
					return next(atMessage)
				}
			} catch (e: any) {
				throw new MiddlewareError('at', e.message)
			}
		})
		return this
	}

	equal(text: string) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (textMessage === text) {
					return next(textMessage)
				}
			} catch (e: any) {
				throw new MiddlewareError('equal', e.message)
			}
		})
		return this
	}

	reg(reg: RegExp) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (reg.test(textMessage)) {
					return next(textMessage.match(reg))
				}
			} catch (e: any) {
				throw new MiddlewareError('reg', e.message)
			}
		})
		return this
	}

	group(groups: number[] | number) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { group_id } = context as GroupMessageEvent
				if ((Array.isArray(groups) && groups.includes(group_id)) || groups === group_id) {
					return next(group_id)
				}
			} catch (e: any) {
				throw new MiddlewareError('group', e.message)
			}
		})
		return this
	}

	sender(uin: number | number[]) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { sender } = context as GroupMessageEvent | PrivateMessageEvent
				if (!Array.isArray(uin)) {
					uin = [uin]
				}
				if (uin.includes(sender.user_id)) {
					return next(sender)
				}
			} catch (e: any) {
				throw new MiddlewareError('sender', e.message)
			}
		})

		return this
	}

	image(count = 1) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const imageMessage = getTargetType(message, 'image')
				if (imageMessage.length !== 0 && imageMessage.length >= count) {
					return next(imageMessage)
				}
				throw new MiddlewareError('image', 'Image count not match')
			} catch (e: any) {
				throw new MiddlewareError('image', e.message)
			}
		})
		return this
	}

	startsWith(prefix: string) {
		this.stack.push((context: any, next: Next) => {
			try {
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const textMessage = getTargetType(message, 'text').map(elem => elem.text.trim()).join('')
				if (textMessage.startsWith(prefix)) {
					return next(textMessage.slice(prefix.length).trim())
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
		this.stack.push((context: any, next: Next) => {
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				// 获取消息中的所有类型
				const messageTypes = message.map((elem: MessageElem) => elem.type)
				// 确保消息中的每个类型都在指定类型中，且消息没有多余的类型
				const messageTypeCheckResult = messageTypes.every(type => types.includes(type)) && types.every(type => messageTypes.includes(type))

				if (messageTypeCheckResult) {
					return next(message)
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
		this.stack.push((context: any, next: Next) => {
			try {
				if (!Array.isArray(types))
					types = [types]
				const { message } = context as GroupMessageEvent | PrivateMessageEvent
				const messageTypeCheckResult = Array.from(new Set(types)).every((type) => {
					return message.some((elem: MessageElem) => elem.type === type)
				})
				if (messageTypeCheckResult) {
					return next(message)
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
		this.stack.push((context: any, next: Next) => {
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

							args[command] = defaultValue
							args[alias] = defaultValue
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

				if (checkPassed)
					return next(args)
			} catch (e: any) {
				callback && callback(e.message)
				throw new MiddlewareError('command', e.message)
			}
		})
		return this
	}
}
