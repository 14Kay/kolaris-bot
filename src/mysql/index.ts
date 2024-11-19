import type { Pool, PoolConfig } from 'mysql'
import type { MysqlError, Result } from './types'
import mysql from 'mysql'

export class KolarisMysqlError extends Error {
	name = 'KolarisMysqlError'
	constructor(message: string) {
		super(message)
	}
}

export class Mysql {
	pool: Pool
	constructor(config: PoolConfig) {
		this.pool = mysql.createPool(config)
	}

	async command<T = any>(command: string, value?: Array<any>): Promise<Result<T>> {
		try {
			return new Promise<Result<T>>((resolve, reject) => {
				this.pool.getConnection((error, connection) => {
					if (error) {
						const result: MysqlError = {
							error,
							msg: `数据库连接出错` + `:${error.message}`,
						}
						reject(result)
					}
					const callback: mysql.queryCallback = (err, results?: T | any, fields?: mysql.FieldInfo[]) => {
						// 释放连接
						connection.release()
						if (err) {
							// 查询失败，抛出异常
							const result: MysqlError = {
								error: err,
								msg: err.sqlMessage || '数据库增删改查出错',
							}
							reject(result)
						} else {
							// 查询成功，返回结果
							const result: Result<T> = {
								msg: 'ok',
								state: 1,
								// 将数据库里的字段, 由下划线更改为小驼峰
								results,
								fields: fields || [],
							}
							resolve(result)
						}
					}
					if (value) {
						this.pool.query(command, value, callback)
					} else {
						this.pool.query(command, callback)
					}
				})
			}).catch((error: any) => {
				throw new KolarisMysqlError(error.msg)
			})
		} catch (e: any) {
			throw new KolarisMysqlError(`数据库操作出错: ${e.message}`)
		}
	}
}
