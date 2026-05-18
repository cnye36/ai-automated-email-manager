import { sql, type SQL } from 'drizzle-orm'
import { contacts } from '@/lib/db/schema'

function searchExprs() {
  const fullName = sql`lower(trim(coalesce(${contacts.firstName}, '') || ' ' || coalesce(${contacts.lastName}, '')))`
  const reverseName = sql`lower(trim(coalesce(${contacts.lastName}, '') || ' ' || coalesce(${contacts.firstName}, '')))`
  const first = sql`lower(coalesce(${contacts.firstName}, ''))`
  const last = sql`lower(coalesce(${contacts.lastName}, ''))`
  const email = sql`lower(${contacts.primaryEmail})`
  const company = sql`lower(coalesce(${contacts.companyName}, ''))`
  const companyAlt = sql`lower(coalesce(${contacts.companyNameForEmails}, ''))`
  return { fullName, reverseName, first, last, email, company, companyAlt }
}

/** Case-insensitive match on name, email, or company. */
export function contactSearchWhereClause(query: string): SQL {
  const lower = query.toLowerCase()
  const { fullName, reverseName, first, last, email, company, companyAlt } = searchExprs()
  return sql`(
    strpos(${first}, ${lower}) > 0
    OR strpos(${last}, ${lower}) > 0
    OR strpos(${fullName}, ${lower}) > 0
    OR strpos(${reverseName}, ${lower}) > 0
    OR strpos(${email}, ${lower}) > 0
    OR strpos(${company}, ${lower}) > 0
    OR strpos(${companyAlt}, ${lower}) > 0
  )`
}

function companyMatchRanks(
  lower: string,
  len: number,
  company: SQL,
  companyAlt: SQL,
  baseRank: number,
): SQL[] {
  return [
    sql`WHEN ${company} = ${lower} OR ${companyAlt} = ${lower} THEN ${baseRank}`,
    sql`WHEN left(${company}, ${len}) = ${lower} OR left(${companyAlt}, ${len}) = ${lower} THEN ${baseRank + 1}`,
    sql`WHEN strpos(${company}, ${lower}) > 0 OR strpos(${companyAlt}, ${lower}) > 0 THEN ${baseRank + 2}`,
  ]
}

function nameMatchRanks(
  lower: string,
  len: number,
  fullName: SQL,
  reverseName: SQL,
  first: SQL,
  last: SQL,
  baseRank: number,
): SQL[] {
  return [
    sql`WHEN ${fullName} = ${lower} OR ${reverseName} = ${lower} THEN ${baseRank}`,
    sql`WHEN ${first} = ${lower} THEN ${baseRank + 1}`,
    sql`WHEN ${last} = ${lower} THEN ${baseRank + 2}`,
    sql`WHEN left(${fullName}, ${len}) = ${lower} OR left(${reverseName}, ${len}) = ${lower} THEN ${baseRank + 3}`,
    sql`WHEN left(${first}, ${len}) = ${lower} THEN ${baseRank + 4}`,
    sql`WHEN left(${last}, ${len}) = ${lower} THEN ${baseRank + 5}`,
    sql`WHEN strpos(${fullName}, ${lower}) > 0 OR strpos(${reverseName}, ${lower}) > 0 THEN ${baseRank + 6}`,
    sql`WHEN strpos(${first}, ${lower}) > 0 THEN ${baseRank + 7}`,
    sql`WHEN strpos(${last}, ${lower}) > 0 THEN ${baseRank + 8}`,
  ]
}

function emailMatchRanks(lower: string, len: number, email: SQL, baseRank: number): SQL[] {
  return [
    sql`WHEN ${email} = ${lower} THEN ${baseRank}`,
    sql`WHEN left(${email}, ${len}) = ${lower} THEN ${baseRank + 1}`,
    sql`WHEN strpos(${email}, ${lower}) > 0 THEN ${baseRank + 2}`,
  ]
}

/** Lower rank = better match; order depends on whether the query looks like email vs name. */
export function contactSearchRankOrder(query: string): SQL {
  const lower = query.toLowerCase()
  const len = lower.length
  const { fullName, reverseName, first, last, email, company, companyAlt } = searchExprs()

  const looksLikeEmail = query.includes('@')
  const looksLikeDomain = !query.includes(' ') && query.includes('.')

  let branches: SQL[]
  if (looksLikeEmail) {
    branches = [
      ...emailMatchRanks(lower, len, email, 0),
      ...nameMatchRanks(lower, len, fullName, reverseName, first, last, 10),
      ...companyMatchRanks(lower, len, company, companyAlt, 20),
    ]
  } else if (looksLikeDomain) {
    branches = [
      ...emailMatchRanks(lower, len, email, 0),
      ...companyMatchRanks(lower, len, company, companyAlt, 5),
      ...nameMatchRanks(lower, len, fullName, reverseName, first, last, 10),
    ]
  } else {
    branches = [
      ...nameMatchRanks(lower, len, fullName, reverseName, first, last, 0),
      ...companyMatchRanks(lower, len, company, companyAlt, 10),
      ...emailMatchRanks(lower, len, email, 15),
    ]
  }

  return sql`CASE ${sql.join(branches, sql` `)} ELSE 99 END`
}
