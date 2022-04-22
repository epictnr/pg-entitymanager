import hash from 'object-hash'
import { Pool, QueryResult } from 'pg'

type FieldsMap = Record<string, string>
type DBRow = Record<string, string>

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Entity {}

export interface Config {
  entity: any
  tableName: string
  primaryKey: Array<string>
  fieldsMap: FieldsMap
}

export class EntityManager {
  private pool: Pool
  private entity: any
  private entityName: string
  private tableName: string
  private primaryKey: Array<string>
  private fieldsMap: FieldsMap
  private entityList: WeakMap<Entity, string>

  constructor (config: Config, pool: Pool) {
    this.pool = pool
    this.entity = config.entity
    this.entityName = (Object.create(this.entity.prototype)).constructor.name
    this.tableName = config.tableName
    this.primaryKey = config.primaryKey
    this.fieldsMap = config.fieldsMap

    this.entityList = new WeakMap()

    if (!Array.isArray(this.primaryKey)) {
      this.primaryKey = [this.primaryKey]
    }
  }

  getTableName (): string {
    return this.tableName
  }

  getPrimaryKey (): Array<string> {
    return this.primaryKey
  }

  getFields (): Array<string> {
    return Object.keys(this.fieldsMap).map(key => this.fieldsMap[key])
  }

  getFieldByPropName (propName: string): string {
    return this.fieldsMap[propName]
  }

  fetchEntity (dbRow: DBRow): Entity {
    const entity = Object.create(this.entity.prototype)

    for (const propName in this.fieldsMap) {
      const filedName = this.fieldsMap[propName]

      entity[propName] = dbRow[filedName]
    }

    return entity
  }

  fetchData (entity: Entity): Array<any> {
    const value: Array<any> = []

    for (const propName in this.fieldsMap) {
      value.push(entity[propName])
    }

    return value
  }

  async query (query: string, values: Array<any> = []): Promise<Array<Entity> | null> {
    query = this.prepareQuery(query)

    const isSelectQuery = query.substring(0, 'select'.length).toLowerCase() === 'select'

    const result = await this.execQuery(query, values)

    if (!result.rowCount) {
      return null
    }

    if (!isSelectQuery) {
      return result.rows[0]
    }

    const list: Array<Entity> = []

    result.rows.forEach((row) => {
      const entity = this.fetchEntity(row)

      this.entityList.set(entity, hash(entity))

      list.push(entity)
    })

    return list
  }

  async persist (entity: Entity): Promise<void> {
    const isEntityNotChanged = this.entityList.get(entity) && this.entityList.get(entity) === hash(entity)

    if (isEntityNotChanged) {
      return
    }

    const table = this.getTableName()
    const fields = this.getFields()

    const primaryKey = this.getPrimaryKey()
    const primaryKeyField = primaryKey.map(pk => this.getFieldByPropName(pk))

    const value = this.fetchData(entity)
    const valuesMask = value.map((val, index) => `$${index + 1}`)

    const updateSet = fields.map((field) => {
      return `${field} = Excluded.${field}`
    })

    const query = `INSERT INTO "${table}" (${fields.join(',')})
    VALUES (${valuesMask.join(',')})
    ON CONFLICT (${primaryKeyField.join(',')})
    DO UPDATE SET
    ${updateSet.join(',')};`

    await this.execQuery(query, value)

    this.entityList.set(entity, hash(entity))
  }

  private execQuery (query: string, params: Array<any>): Promise<QueryResult> {
    return this.pool.query(query, params)
  }

  private prepareQuery (query: string): string {
    query = query.trim()

    const replaceConditions: Array<Array<string>> = []

    const aliasResult = query.match(/from\s(\w+)\s:(\w+)/i) // from EntityName :alias

    if (!aliasResult) {
      return query
    }

    if (aliasResult[1] !== this.entityName) {
      return query
    }

    const entityAlias = aliasResult[2]

    // replace table name and alias
    // TestEntity :te
    replaceConditions.push([`${this.entityName} :${entityAlias}`, `"${this.tableName}"`])
    // replace alias to all fields
    // select :te -> select field_1, field_2
    replaceConditions.push([`:${entityAlias}`, this.getFields().join(',')])

    for (const propName in this.fieldsMap) {
      const aliasPropName = `${entityAlias}.${propName}`
      const filedName = this.fieldsMap[propName]

      replaceConditions.push([aliasPropName, filedName])
    }

    for (const replaceCondition of replaceConditions) {
      const replaceRegExp = new RegExp(`([\\s, ','])${replaceCondition[0]}([\\s, ','])`, 'g')
      const replacer = (match, p1, p2) => `${p1}${replaceCondition[1]}${p2}`

      query = query.replace(replaceRegExp, replacer)
    }

    return query
  }
}
