import type mysql from 'mysql'

export interface MysqlError {
	msg: string
	error?: mysql.MysqlError
}

// mysql 连接数据库返回值
export interface Result<T = any> {
	/** `state===1`时为成功 */
	state: number
	/** 结果数组 或 对象 */
	results: T
	/** 状态 */
	fields?: Array<mysql.FieldInfo>
	/** 错误信息 */
	error?: mysql.MysqlError
	/** 描述信息 */
	msg: string
}

export type StringResult = Result<string[]>

export interface MysqlConfig {
	host: string
	port: number
	user: string
	password: string
	database: string
	multipleStatements: boolean
	connectionLimit: number
	connectTimeout: number
	acquireTimeout: number
	timeout: number
	charset: string
}
