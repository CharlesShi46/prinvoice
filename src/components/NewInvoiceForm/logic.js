import { v4 as uuidv4 } from 'uuid'
import BigNumber from 'bignumber.js'
import { USERBASE_DATABASE_NAME, DEFAULT_CURRENCY } from '../../config'
import {
  addDaysToDate,
  isValidDate,
  isValidEmail,
  currencySymbolMap,
  numberToNumberString,
  downloadFileLocally,
} from '../../utils'
import {Deta} from 'deta'

const deta = Deta('YOUR_KEY_HERE'); 
const invoices_db = deta.Base('invoices_db');
const invoice_item_db = deta.Base('invoice_item_db');
const resource_db = deta.Base('resource_db');
const agent_db = deta.Base('agent_db');
const user_db = deta.Base('user_db');

class DetailedErrors extends Error {
  constructor(errors, errorMap) {
    super()
    this.errors = errors
    this.errorMap = errorMap
  }
}

export const newEmptyInvoice = async (user) => {
  const data = await getUserDefaults(user)
  const userDefaults = {...data}
  const { name, currency } = userDefaults

  return {
    uuid: uuidv4(),
    dateIssued: new Date(),
    dateDue: addDaysToDate(new Date(), 28),
    items: [newEmptyInvoiceItem()],
    payor: { uuid: uuidv4() },
    payee: { ...user, name: name || '' },
    currency: currency || DEFAULT_CURRENCY,
    discount: 0,
    taxPercent: 0,
    shipping: 0,
    note: '',
  }
}

export const newEmptyInvoiceItem = () => ({
  resourceUuid: uuidv4(),
  name: '',
  quantity: 1,
  unitPrice: 0
})

export const getItemAmount = (item) => {
  return (item.quantity <= 0 || item.unitPrice <= 0 || isNaN(Number(item.quantity)) || isNaN(Number(item.unitPrice)))
    ? new BigNumber(0)
    : new BigNumber(item.quantity).multipliedBy(new BigNumber(item.unitPrice))
}

export const getSubtotal = (items) => {
  let subtotal = new BigNumber(0)
  for (let i = 0; i < items.length; i++) {
    const itemAmount = getItemAmount(items[i])
    if (itemAmount.isPositive()) subtotal = subtotal.plus(itemAmount)
  }
  return subtotal
}

export const getSubtotalAfterDiscount = (subtotal, discount) => {
  const discountBigNumber = (discount > 0 && !isNaN(Number(discount)))
    ? new BigNumber(discount)
    : new BigNumber(0)

  const afterDiscount = subtotal.minus(discountBigNumber)
  return afterDiscount.isNegative()
    ? new BigNumber(0)
    : afterDiscount
}

export const getTax = (taxPercent, subtotalAfterDiscount) => {
  if (taxPercent <= 0 || isNaN(Number(taxPercent))) {
    return new BigNumber(0)
  } else {
    const taxPercentBigNumber = new BigNumber(taxPercent).dividedBy(100)
    return subtotalAfterDiscount.multipliedBy(taxPercentBigNumber)
  }
}

export const getTotal = (subtotalAfterDiscount, tax, shipping) => {
  const shippingBigNumber = (shipping > 0 && !isNaN(Number(shipping)))
    ? new BigNumber(shipping)
    : new BigNumber(0)

  return subtotalAfterDiscount.plus(tax).plus(shippingBigNumber)
}

const _validateInvoiceItems = (items, errors, errorMap) => {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const { resourceUuid, name, quantity, unitPrice } = item

    errorMap.items[resourceUuid] = {}

    const itemNumber = i + 1
    if (!name) {
      errors.push(`Item ${itemNumber} is missing an Item name.`)
      errorMap.items[resourceUuid].name = true
    }

    if (!quantity && quantity !== 0) {
      errors.push(`Item ${itemNumber} is missing a Quantity.`)
      errorMap.items[resourceUuid].quantity = true
    } else if (quantity <= 0) {
      errors.push(`Item ${itemNumber} has Quantity less than or equal to 0. Please include a positive quantity.`)
      errorMap.items[resourceUuid].quantity = true
    }

    if (!unitPrice && unitPrice !== 0) {
      errors.push(`Item ${itemNumber} is missing a Price.`)
      errorMap.items[resourceUuid].unitPrice = true
    }

    if (unitPrice < 0) {
      errors.push(`Item ${itemNumber} has Price less than 0. Please include a price greater than or equal to 0.`)
      errorMap.items[resourceUuid].unitPrice = true
    }
  }
}

export const validateInvoice = (invoice) => {
  const errors = []
  const errorMap = { payee: {}, payor: {}, items: {} }

  const {
    payee,
    payor,
    dateIssued,
    dateDue,
    items,
    discount,
    taxPercent,
    shipping,
  } = invoice

  if (!payee.name) {
    errors.push('Your name is missing. Please include your name.')
    errorMap.payee.name = true
  }

  if (!payor.name) {
    errors.push('BILL TO name is missing. Please include a name to bill.')
    errorMap.payor.name = true
  }

  if (payor.email && !isValidEmail(payor.email)) {
    errors.push('BILL TO email is invalid. Please enter a valid email address.')
    errorMap.payor.email = true
  }

  if (!isValidDate(new Date(dateIssued))) {
    errors.push('Invalid date issued. Please make sure the date is valid and has format YYYY-MM-DD.')
    errorMap.dateIssued = true
  }

  if (dateDue && !isValidDate(new Date(dateDue))) {
    errors.push('Invalid date due. Please make sure the date is valid and has format YYYY-MM-DD.')
    errorMap.dateDue = true
  }

  _validateInvoiceItems(items, errors, errorMap)

  if (discount < 0) {
    errors.push(`Discount provided is less than 0. Please include a discount greater than or equal to 0.`)
    errorMap.discount = true
  }

  if (taxPercent < 0) {
    errors.push(`Tax provided is less than 0. Please include a tax greater than or equal to 0.`)
    errorMap.taxPercent = true
  }

  if (shipping < 0) {
    errors.push(`Shipping cost provided is less than 0. Please include a shipping cost greater than or equal to 0.`)
    errorMap.shipping = true
  }

  if (errors.length) throw new DetailedErrors(errors, errorMap)
}

export const emailInvoiceLink = (invoice) => {
  const {
    payee,
    payor,
    dateDue,
    currency,
    items,
    discount,
    taxPercent,
    shipping,
    note,
  } = invoice

  const subtotal = getSubtotal(items)
  const subtotalAfterDiscount = getSubtotalAfterDiscount(subtotal, discount)
  const tax = getTax(taxPercent, subtotalAfterDiscount)
  const total = currencySymbolMap[currency] + numberToNumberString(getTotal(subtotalAfterDiscount, tax, shipping))

  const dueDate = isValidDate(new Date(dateDue))
    ? (' due ' + new Date(dateDue).toLocaleDateString())
    : ''

  let lineItems = ''
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const { name, quantity, unitPrice } = item

    if (quantity < 0 || unitPrice < 0 || isNaN(Number(quantity)) || isNaN(Number(unitPrice))) continue

    lineItems += `${name} (${quantity} x ${currencySymbolMap[currency]}${numberToNumberString(Number(unitPrice))})\n`
  }

  const subject = encodeURIComponent(`Invoice from ${payee.name || ''} for ${total}`)
  const body = encodeURIComponent(`Hi ${payor.name || ''},\n`
      + '\n'
      + `Here is an invoice for ${total}${dueDate}.\n`
      + '\n'
      + lineItems
      + '\n'
      + (note || 'Thank you!') + '\n'
      + '\n'
      + `${payee.name || ''}`)

  return `mailto:${payor.email || ''}?subject=${subject}&body=${body}`
}

export const downloadInvoicePdf = async (invoice) => {
  // lazy load InvoicePdf because @react-pdf is very large
  const InvoicePdf = (await import('./InvoicePdf')).default

  const pdfObject = InvoicePdf({ invoice })
  const pdfBlob = await pdfObject.toBlob()

  const { payor, dateIssued } = invoice
  const issuedDate = isValidDate(new Date(dateIssued))
    ? (`-${new Date(dateIssued).toLocaleDateString()}`)
    : ''

  const pdfFilename = `Invoice-${payor.name || ''}${issuedDate}.pdf`

  const pdf = new File([pdfBlob], pdfFilename, { type: 'application/pdf' })

  downloadFileLocally(pdf)
}

export const getUserDefaults = async (userId) => {
  var users = await user_db.fetch().next();
  users = users.value;

  for (var i = 0; i < users.length; i++) {
    if (users[i].uuid === userId) {
      return users[i];
    }
  }

  return {};
}

export const getCustomers = async () => {
  var agent = await agent_db.fetch().next();
  agent = agent.value;

  return agent;
}

export const getProducts = async () => {
  var resource = await resource_db.fetch().next();
  resource = resource.value;

  return resource;
}

const _insertInvoice = (invoice, payorUuid) => {
  const {
    uuid,
    payee,
    payor,
    currency,
    dateIssued,
    dateDue,
    discount,
    taxPercent,
    shipping,
    note,
  } = invoice

  var output = {
    'uuid': uuid,
    'key': uuid,
    'created_date': new Date(dateIssued).toISOString(),
    'date_issued': new Date(dateIssued).toISOString(),
    'date_paid': null,
    'date_due': dateDue ? new Date(dateDue).toISOString() : null,
    'currency': currency,
    'discount': parseInt(discount),
    'tax_percent': parseInt(taxPercent),
    'shipping': parseInt(shipping),
    'note': note,
    'payee_uuid': payee.userId,
    'payee_name': payee.name,
    'payee_email': payee.email,
    'payor_name': payor.name,
    'payor_email': payor.email,
    'payor_uuid': payorUuid,      
    'subtotal': 0,
    'total': 0,
  }

  invoices_db.put(output)
  return output
}

const _insertItem = (invoiceUuid, item, itemNumber, resourceUuid) => {
  const { name, unitPrice, quantity } = item

  var output = {
    'invoice_uuid': invoiceUuid,
    'item_name': name,
    'unit_price': parseInt(unitPrice),
    'quantity': quantity
  }

  invoice_item_db.put(output)
  return output
}

const _upsertResource = (item) => {
  const { resourceUuid, name, unitPrice } = item
  
  var output = {
    'uuid': resourceUuid,
    'key': resourceUuid,
    'name': name,
    'unit_price': parseInt(unitPrice)
  }

  resource_db.put(output)
  return output
}

const _upsertPayor = (payor) => {
  var output = {
    'uuid': payor.uuid,
    'key': payor.uuid,
    'name': payor.name,
    'email': payor.email
  }

  agent_db.put(output)
  return output
}

const _upsertUserDefaultSettings = (payee, currency) => {
  var output = {
    'uuid': payee.userId,
    'key': payee.userId,
    'name': payee.name,
    'currency': currency, 
    'created_date': new Date().toISOString()
  }

  user_db.put(output)
  return output
}

export const createInvoice = async (invoice) => {
  const upsertUserDefaults = _upsertUserDefaultSettings(invoice.payee, invoice.currency)
  const upsertPayor = _upsertPayor(invoice.payor)
  const upsertResources = invoice.items.map(item => _upsertResource(item))
  var resources = await resource_db.fetch().next();
  resources = resources.value
  const insertItems = invoice.items.map((item) => _insertItem(invoice.uuid, item))
  const insertInvoice = _insertInvoice(invoice, upsertPayor.uuid)
}
