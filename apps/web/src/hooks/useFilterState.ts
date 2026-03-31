import { useSearchParams } from 'react-router-dom'

/**
 * Sync a filter value with a URL search param.
 * Falls back to defaultValue when the param is absent.
 */
export function useFilterState<T extends string>(
  key: string,
  defaultValue: T
): [T, (val: T) => void] {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) as T) ?? defaultValue

  function setValue(val: T) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (val === defaultValue) {
        next.delete(key)
      } else {
        next.set(key, val)
      }
      return next
    }, { replace: true })
  }

  return [value, setValue]
}
