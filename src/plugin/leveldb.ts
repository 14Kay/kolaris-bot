import type { DatabaseOptions } from 'classic-level'
import { join } from 'node:path'
import process from 'node:process'
import { ClassicLevel } from 'classic-level'

export class Database<T = Record<string, string>> extends ClassicLevel<keyof T, T[keyof T]> {
	constructor(location: string, options?: DatabaseOptions<keyof T, T[keyof T]>) {
		location = join(process.cwd(), 'data', 'leveldb', location)
		super(location, options)
	}
}
