/**
 * Asserts that the known eGain Get-User-by-loginId payload maps to UserProfile
 * with departmentId "1006".
 *
 * Run: npx tsx scripts/assert-user-payload.mts
 */
import { departmentFromUserRaw, mapUser, unwrapList } from '../src/api/mappers.ts'

const sample = {
  user: [
    {
      id: 2504,
      loginId: 'f_bduser',
      firstName: 'BD',
      lastName: 'User',
      screenName: 'BD User',
      departments: {
        department: [
          {
            id: 1006,
            name: 'Pre-Sales - Finance',
            home: 'yes',
          },
        ],
      },
      languages: {
        language: [
          { code: 'en-us', label: 'English (US)', isDefault: true },
        ],
      },
    },
  ],
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

function firstUserFromPayload(data: unknown) {
  const list = unwrapList(data, ['user', 'users', 'User', 'Users'])
  if (list.length > 0) {
    const mapped = mapUser(list[0])
    if (mapped.id || mapped.userName || mapped.departmentId) return mapped
  }
  return null
}

const list = unwrapList(sample, ['user', 'users'])
assert(list.length === 1, `expected 1 user, got ${list.length}`)

const mapped = mapUser(list[0])
assert(mapped.id === '2504', `id: ${mapped.id}`)
assert(mapped.userName === 'f_bduser', `userName: ${mapped.userName}`)
assert(mapped.departmentId === '1006', `departmentId: ${mapped.departmentId}`)
assert(
  mapped.department === 'Pre-Sales - Finance',
  `department: ${mapped.department}`,
)

const dept = departmentFromUserRaw(list[0])
assert(dept.departmentId === '1006', `dept helper: ${dept.departmentId}`)

const viaHelper = firstUserFromPayload(sample)
assert(viaHelper?.departmentId === '1006', `firstUser: ${viaHelper?.departmentId}`)

const single = firstUserFromPayload({ user: sample.user[0] })
assert(single?.departmentId === '1006', `single object: ${single?.departmentId}`)

console.log('assert-user-payload: OK', {
  id: mapped.id,
  userName: mapped.userName,
  departmentId: mapped.departmentId,
  department: mapped.department,
  defaultLanguage: mapped.defaultLanguage,
})
