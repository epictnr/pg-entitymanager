Epictnr PG-entitymanager 🐘
======

Simple O~~R~~M (without R - relation)

*(the part of micro-starter framework)*

### How to use

```js
const pg = require('pg')
const { EntityManager } = require('@epictnr/pg-em')
const { v4: uuidv4 } = require('uuid')

const connectionString = 'postgres://admin:admin@postgresql:5432/database';

const pool = new pg.Pool({
  connectionString,
})

const db = {
  query: (query, params) => pool.query(query, params),
  getPool: () => pool,
}

class Order {
  constructor (userId, shopId, customerInfo) {
    this.orderId = uuidv4()
    this.userId = userId

    this.shopId = shopId
    this.customer = customerInfo

    this.createdAt = new Date()
  }

  getId () {
    return this.orderId
  }
}

class OrderRepository {
  constructor () {
    const emConfig = {
      entity: Order,
      tableName: 'order',
      primaryKey: 'orderId',
      fieldsMap: {
        orderId: 'order_id',
        userId: 'user_id',
        shopId: 'shop_id',
        createdAt: 'created_at',
      },
    }
    const dbPool = db.getPool()

    this.em = new EntityManager(emConfig, dbPool)
  }

  async findByUserId (userId) {
    const query = `SELECT :o
      FROM Order :o
      WHERE o.userId = $1;`

    const entity = await this.em.query(query, [userId])

    return entity || []
  }

  async save (order) {
    await this.em.persist(order)
  }
}

const order = new Order(1, 100, "customer info")
orderRepository.save(order)
```

### How to publish:

```console
$ npm pub
```
