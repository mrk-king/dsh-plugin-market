import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSearchQuery } from '../server.mjs'

test('空查询默认限定 DSH 标签', () => {
  assert.equal(buildSearchQuery('', false), 'topic:dsh-plugin')
})

test('关键词自动叠加 DSH 限定', () => {
  assert.equal(buildSearchQuery('python', false), 'python topic:dsh-plugin')
})

test('scope=all 时不加限定（保留关键词）', () => {
  assert.equal(buildSearchQuery('python', true), 'python')
})

test('空查询且 scope=all 时返回空串（前端会显示引导空态）', () => {
  assert.equal(buildSearchQuery('', true), '')
})

test('含 topic: 的高级查询原样保留，不重复叠加', () => {
  assert.equal(buildSearchQuery('topic:dsh-plugin minimal', false), 'topic:dsh-plugin minimal')
})

test('查询首尾空白会被清理', () => {
  assert.equal(buildSearchQuery('  minimal  ', false), 'minimal topic:dsh-plugin')
})
