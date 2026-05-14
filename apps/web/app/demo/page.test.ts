// app/demo/page.test.ts

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

import DemoPage from './page'
import { notFound } from 'next/navigation'

const mockNotFound = notFound as jest.Mock

describe('DemoPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('in development', () => {
    beforeAll(() => {
      process.env.NODE_ENV = 'development'
    })

    it('renders without calling notFound()', () => {
      DemoPage()
      expect(mockNotFound).not.toHaveBeenCalled()
    })

    it('returns a defined JSX element', () => {
      const result = DemoPage()
      expect(result).toBeDefined()
    })
  })

  describe('in production', () => {
    const originalEnv = process.env.NODE_ENV

    beforeAll(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true })
    })

    afterAll(() => {
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true })
    })

    it('calls notFound() and does not render', () => {
      expect(() => DemoPage()).toThrow('NEXT_NOT_FOUND')
      expect(mockNotFound).toHaveBeenCalledTimes(1)
    })
  })
})
