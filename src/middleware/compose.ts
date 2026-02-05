import type { TMiddleware } from './middleware'

/**
 * Compose middlewares into a single middleware function
 * @param middleware Array of middleware functions
 * @returns Composed middleware that returns true if all middlewares called next(), false otherwise
 */
export function compose<T>(middleware: TMiddleware<T>[]): (context: T, next?: () => Promise<any>) => Promise<boolean> {
	if (!Array.isArray(middleware))
		throw new TypeError('Middleware stack must be an array!')
	for (const fn of middleware) {
		if (typeof fn !== 'function')
			throw new TypeError('Middleware must be composed of functions!')
	}

	return function (context, next) {
		// last called middleware #
		let index = -1
		return dispatch(0).then(() => {
			// 检查是否所有中间件都被执行了（index 应该等于 middleware.length）
			return index === middleware.length
		})
		function dispatch(i: number): Promise<any> {
			if (i <= index)
				return Promise.reject(new Error('next() called multiple times'))
			index = i
			let fn = middleware[i]
			if (i === middleware.length)
				fn = next as any
			if (!fn)
				return Promise.resolve()
			try {
				return Promise.resolve(fn(context, dispatch.bind(null, i + 1)))
			} catch (err) {
				return Promise.reject(err)
			}
		}
	}
}
