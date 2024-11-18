export interface CommandOptions {
	command: string
	alias: string
	description?: string
	required?: boolean
	type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
	defaultValue?: string | number | boolean
}
