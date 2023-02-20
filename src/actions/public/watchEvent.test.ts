import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { getAddress } from '../../utils'
import { wait } from '../../utils/wait'
import {
  accounts,
  address,
  publicClient,
  testClient,
  usdcContractConfig,
  walletClient,
} from '../../_test'
import { impersonateAccount, mine, stopImpersonatingAccount } from '../test'
import { sendTransaction, writeContract } from '../wallet'
import * as createEventFilter from './createEventFilter'
import * as getFilterChanges from './getFilterChanges'
import { OnLogsResponse, watchEvent } from './watchEvent'

const event = {
  transfer: {
    inputs: [
      {
        indexed: true,
        name: 'from',
        type: 'address',
      },
      {
        indexed: true,
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'Transfer',
    type: 'event',
  },
  approval: {
    type: 'event',
    name: 'Approval',
    inputs: [
      {
        indexed: true,
        name: 'owner',
        type: 'address',
      },
      {
        indexed: true,
        name: 'spender',
        type: 'address',
      },
      {
        indexed: false,
        name: 'value',
        type: 'uint256',
      },
    ],
  },
} as const

beforeAll(async () => {
  await impersonateAccount(testClient, {
    address: address.vitalik,
  })
  await mine(testClient, { blocks: 1 })
})

afterAll(async () => {
  await stopImpersonatingAccount(testClient, {
    address: address.vitalik,
  })
})

test(
  'default',
  async () => {
    let logs: OnLogsResponse[] = []

    const unwatch = watchEvent(publicClient, {
      onLogs: (logs_) => logs.push(logs_),
    })

    await wait(1000)
    await writeContract(walletClient, {
      ...usdcContractConfig,
      functionName: 'transfer',
      args: [accounts[0].address, 1n],
      from: address.vitalik,
    })
    await writeContract(walletClient, {
      ...usdcContractConfig,
      functionName: 'transfer',
      args: [accounts[0].address, 1n],
      from: address.vitalik,
    })
    await wait(1000)
    await writeContract(walletClient, {
      ...usdcContractConfig,
      functionName: 'transfer',
      args: [accounts[1].address, 1n],
      from: address.vitalik,
    })
    await wait(2000)
    unwatch()

    expect(logs.length).toBe(2)
    expect(logs[0].length).toBe(2)
    expect(logs[1].length).toBe(1)
  },
  { retry: 3 },
)

test('args: batch', async () => {
  let logs: OnLogsResponse[] = []

  const unwatch = watchEvent(publicClient, {
    batch: false,
    onLogs: (logs_) => logs.push(logs_),
  })

  await wait(1000)
  await writeContract(walletClient, {
    ...usdcContractConfig,
    functionName: 'transfer',
    args: [accounts[0].address, 1n],
    from: address.vitalik,
  })
  await writeContract(walletClient, {
    ...usdcContractConfig,
    functionName: 'transfer',
    args: [accounts[0].address, 1n],
    from: address.vitalik,
  })
  await wait(1000)
  await writeContract(walletClient, {
    ...usdcContractConfig,
    functionName: 'transfer',
    args: [accounts[1].address, 1n],
    from: address.vitalik,
  })
  await wait(2000)
  unwatch()

  expect(logs.length).toBe(3)
  expect(logs[0].length).toBe(1)
  expect(logs[1].length).toBe(1)
  expect(logs[2].length).toBe(1)
})

test('args: address', async () => {
  let logs: OnLogsResponse[] = []
  let logs2: OnLogsResponse[] = []

  const unwatch = watchEvent(publicClient, {
    address: usdcContractConfig.address,
    onLogs: (logs_) => logs.push(logs_),
  })
  const unwatch2 = watchEvent(publicClient, {
    address: '0x0000000000000000000000000000000000000000',
    onLogs: (logs_) => logs2.push(logs_),
  })

  await wait(1000)
  await writeContract(walletClient, {
    ...usdcContractConfig,
    functionName: 'transfer',
    args: [accounts[0].address, 1n],
    from: address.vitalik,
  })
  await wait(2000)
  unwatch()
  unwatch2()

  expect(logs.length).toBe(1)
  expect(logs2.length).toBe(0)
})

test('args: address + event', async () => {
  let logs: OnLogsResponse<typeof event.transfer>[] = []
  let logs2: OnLogsResponse<typeof event.approval>[] = []

  const unwatch = watchEvent(publicClient, {
    address: usdcContractConfig.address,
    event: event.transfer,
    onLogs: (logs_) => logs.push(logs_),
  })
  const unwatch2 = watchEvent(publicClient, {
    address: usdcContractConfig.address,
    event: event.approval,
    onLogs: (logs_) => logs2.push(logs_),
  })

  await wait(1000)
  await writeContract(walletClient, {
    ...usdcContractConfig,
    functionName: 'transfer',
    args: [accounts[0].address, 1n],
    from: address.vitalik,
  })
  await wait(2000)
  unwatch()
  unwatch2()

  expect(logs.length).toBe(1)
  expect(logs2.length).toBe(0)

  expect(logs[0][0].eventName).toEqual('Transfer')
  expect(logs[0][0].args).toEqual({
    from: getAddress(address.vitalik),
    to: getAddress(accounts[0].address),
    value: 1n,
  })
})

test.todo('args: args')

describe('errors', () => {
  test('handles error thrown from creating filter', async () => {
    vi.spyOn(createEventFilter, 'createEventFilter').mockRejectedValueOnce(
      new Error('foo'),
    )

    let unwatch: () => void = () => null
    const error = await new Promise((resolve) => {
      unwatch = watchEvent(publicClient, {
        onLogs: () => null,
        onError: resolve,
      })
    })
    expect(error).toMatchInlineSnapshot('[Error: foo]')
    unwatch()
  })

  test(
    'handles error thrown from filter changes',
    async () => {
      vi.spyOn(getFilterChanges, 'getFilterChanges').mockRejectedValueOnce(
        new Error('bar'),
      )

      let unwatch: () => void = () => null
      const error = await new Promise((resolve) => {
        unwatch = watchEvent(publicClient, {
          onLogs: () => null,
          onError: resolve,
        })
      })
      expect(error).toMatchInlineSnapshot('[Error: bar]')
      unwatch()
    },
    { retry: 3 },
  )
})