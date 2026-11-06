import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount rendered components after each test (vitest runs without globals here).
afterEach(() => cleanup())
