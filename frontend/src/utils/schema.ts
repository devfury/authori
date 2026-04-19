// frontend/src/utils/schema.ts

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum'

export interface FieldDef {
  _id: string
  label: string
  key: string
  type: FieldType
  required: boolean
  minLength?: number | null
  maxLength?: number | null
  pattern?: string
  minimum?: number | null
  maximum?: number | null
  enumValues: string
}

export function newField(): FieldDef {
  return {
    _id: Math.random().toString(36).slice(2),
    label: '',
    key: '',
    type: 'string',
    required: false,
    enumValues: '',
  }
}

/**
 * JSON Schema → FieldDef[] 변환.
 * x-order 배열이 있으면 그 순서대로 정렬하고, 없으면 Object.entries 순서를 따른다.
 */
export function parseJsonSchema(schema: Record<string, unknown>): FieldDef[] {
  const props = (schema.properties as Record<string, Record<string, unknown>>) ?? {}
  const req = (schema.required as string[]) ?? []
  const order = (schema['x-order'] as string[]) ?? []

  const entries = Object.entries(props)
  if (order.length > 0) {
    entries.sort(([a], [b]) => {
      const ai = order.indexOf(a)
      const bi = order.indexOf(b)
      const an = ai === -1 ? Infinity : ai
      const bn = bi === -1 ? Infinity : bi
      return an - bn
    })
  }

  return entries.map(([key, def]) => {
    const f = newField()
    f.key = key
    f.label = (def.title as string) ?? key
    f.required = req.includes(key)
    if ('enum' in def) {
      f.type = 'enum'
      f.enumValues = (def.enum as unknown[]).join(', ')
    } else {
      f.type = (def.type as FieldType) ?? 'string'
      if (def.minLength != null) f.minLength = def.minLength as number
      if (def.maxLength != null) f.maxLength = def.maxLength as number
      if (def.pattern) f.pattern = def.pattern as string
      if (def.minimum != null) f.minimum = def.minimum as number
      if (def.maximum != null) f.maximum = def.maximum as number
    }
    return f
  })
}

/**
 * FieldDef[] → JSON Schema 변환.
 * fields 배열 순서를 x-order에 기록한다.
 */
export function buildJsonSchema(fields: FieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const order: string[] = []

  for (const f of fields) {
    if (!f.key) continue
    order.push(f.key)
    if (f.type === 'enum') {
      const values = f.enumValues.split(',').map((v) => v.trim()).filter(Boolean)
      const prop: Record<string, unknown> = { type: 'string', enum: values }
      if (f.label) prop.title = f.label
      properties[f.key] = prop
    } else {
      const prop: Record<string, unknown> = { type: f.type }
      if (f.label) prop.title = f.label
      if (f.type === 'string') {
        if (f.minLength != null) prop.minLength = f.minLength
        if (f.maxLength != null) prop.maxLength = f.maxLength
        if (f.pattern) prop.pattern = f.pattern
      }
      if (f.type === 'number' || f.type === 'integer') {
        if (f.minimum != null) prop.minimum = f.minimum
        if (f.maximum != null) prop.maximum = f.maximum
      }
      properties[f.key] = prop
    }
    if (f.required) required.push(f.key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    ...(order.length > 0 ? { 'x-order': order } : {}),
  }
}
