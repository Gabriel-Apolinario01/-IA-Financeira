import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePeriodicSpending, simulate } from '../lib/finance';
import { demoState } from '../lib/demo';

test('12 monthly contributions at zero interest equal hypothetical spending', () => {
  const result=comparePeriodicSpending({initial:0,monthly:10000,months:12,annualRate:'0'});
  assert.equal(result.spent,120000);assert.equal(result.contributed,120000);
  assert.equal(result.balance,120000);assert.equal(result.difference,0);
});
for (const input of [
  {initial:100000,monthly:0,months:12,annualRate:'12'},
  {initial:0,monthly:10000,months:12,annualRate:'12'},
  {initial:10000,monthly:1234,months:1,annualRate:'12'},
  {initial:0,monthly:0,months:12,annualRate:'0'},
  {initial:101,monthly:101,months:12,annualRate:'-10'},
]) test(`comparison preserves original simulator ${JSON.stringify(input)}`, () => {
  const expected=simulate(input), result=comparePeriodicSpending(input);
  assert.deepEqual(result.rows,expected.rows);
  assert.equal(result.balance,expected.balance);assert.equal(result.difference,expected.growth);
  assert.equal(result.contributed,input.initial+input.monthly*input.months);
  assert.equal(result.spent,input.monthly*input.months);
  assert.ok(Number.isSafeInteger(result.balance));
  if (input.initial===100000) assert.equal(result.balance,112000);
  if (input.initial===10000) assert.equal(result.balance,11329); // 100 * 1.12^(1/12) + 12.34
});
test('positive monthly returns follow end-of-month convention and cent rounding', () => {
  const result=comparePeriodicSpending({initial:0,monthly:10000,months:12,annualRate:'12'});
  assert.equal(result.rows[0].balance,10000);
  assert.equal(result.balance,126465);
  assert.equal(result.growth,6465);
});
test('comparison rejects invalid money, months and rates using the shared validation', () => {
  const input={initial:0,monthly:1234,months:12,annualRate:'0'};
  for(const patch of [{initial:-1},{monthly:1.5},{monthly:NaN},{months:0},{months:601},{months:1.5},{annualRate:'-100'},{annualRate:'1001'},{annualRate:'NaN'},{annualRate:'1e3'}]) assert.throws(()=>comparePeriodicSpending({...input,...patch}));
});
test('simulation is detached from persisted records, goals and balances', () => {
  const state=demoState('2026-11'), before=JSON.stringify(state);
  comparePeriodicSpending({initial:0,monthly:state.transactions[1].amount,months:12,annualRate:'12'});
  assert.equal(JSON.stringify(state),before);
});
