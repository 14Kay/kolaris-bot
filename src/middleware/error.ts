export class MiddlewareError extends Error {
	name = 'MiddlewareError'
	middleware: string = ''
	constructor(name: string = 'unknow', message: string) {
		super(message)
		this.middleware = name
	}
}
