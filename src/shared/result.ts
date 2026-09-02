export type AppErrorCode =
  | 'LICENSE_REQUIRED'
  | 'SVIP_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'INVALID_INPUT'
  | 'INVALID_RESPONSE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CANCELLED'
  | 'INTERNAL'

export interface AppError {
  code: AppErrorCode
  message: string
  details?: string
  retryable?: boolean
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const err = (
  code: AppErrorCode,
  message: string,
  options: Pick<AppError, 'details' | 'retryable'> = {}
): Result<never> => ({ ok: false, error: { code, message, ...options } })

export const toAppError = (error: unknown, fallback = '操作失败'): AppError => {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as AppError
  }
  return {
    code: 'INTERNAL',
    message: error instanceof Error ? error.message : fallback
  }
}