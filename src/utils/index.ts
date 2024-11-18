/*
 * @Description:
 * @Author: 14K
 * @Date: 2024-11-14 20:09:41
 * @LastEditTime: 2024-11-17 17:50:11
 * @LastEditors: 14K
 */
import type { MessageElem } from '@icqq-plus/icqq'
import fs from 'node:fs'
import path from 'node:path'

export function getDirName(dir: string): string[] {
	return fs.readdirSync(dir)
		.filter(item => fs.statSync(path.join(dir, item)).isDirectory())
}

export function getTargetType<T extends MessageElem['type']>(
	message: MessageElem[],
	type: T,
): Extract<MessageElem, { type: T }>[] {
	return message.filter((item): item is Extract<MessageElem, { type: T }> => item.type === type)
}

export class PluginError extends Error {
	name = 'PluginError'
	plugin: string = ''
	constructor(name: string = 'unknow', message: string) {
		super(message)
		this.plugin = name
	}
}

export class KolarisError extends Error {
	name = 'KolarisError'
	constructor(message: string) {
		super(message)
	}
}
