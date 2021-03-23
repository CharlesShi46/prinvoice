import {
  getFirstDayOfMonth,
  getLastDayOfMonth,
  getMonthAsString,
} from '../../utils'
import { DEFAULT_CURRENCY } from '../../config'
import {Deta} from 'deta'

const deta = Deta('YOUR_KEY_HERE'); 
const user_db = deta.Base('user_db');
const invoices_db = deta.Base('invoices_db');
const invoice_item_db = deta.Base('invoice_item_db');

const DISPLAY_NUM_MONTHS = 3
const DISPLAY_NUM_RANKS = 5

export const getCurrency = async (userId) => {
  var users = await user_db.fetch().next();
  users = users.value;

  for (var i = 0; i < users.length; i++) {
    if (users[i].uuid === userId) {
      return users[i].currency;
    }
  }

  return DEFAULT_CURRENCY;
}

export const tempInvoices = async (userId) => {
  const temp = await hasCreatedInvoice()
  if (temp) {
    const currency = await getCurrency(userId);
    const monthlySales = await getMonthlySales(currency)
    const salesByCustomer = await getSalesByCustomer(currency)
    const salesByProduct = await getSalesByProduct(currency)
    const { total, received, owed, overdue } = await getTotals(currency)
    const customerCount = await getCustomerCount()
    const suggestCreateInvoice = false;
    return {
      suggestCreateInvoice,
      currency,
      monthlySales,
      salesByCustomer,
      salesByProduct,
      total,
      received,
      owed,
      overdue,
      customerCount,
    }
  } else {
    return {
      suggestCreateInvoice: true,
      currency : "USD",
      monthlySales : 0,
      salesByCustomer : 0,
      salesByProduct : 0,
      total : 0,
      received : 0,
      owed : 0,
      overdue : 0,
      customerCount : 0,
    }
  }
}

export const hasCreatedInvoice = async () => {
  var invoice = await invoices_db.fetch().next();
  invoice = invoice.value;
  return invoice.length > 0;
}

const _getSalesForMonth = async (start, end, currency) => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value;
  var total = 0;
  for (var i = 0; i < invoices.length; i++) {
    var dateIssued = new Date(invoices[i].date_issued)
    if (start < dateIssued && end > dateIssued) {
      total += invoices[i].total;
    }
  }

  return [{'sales': total}];
}

export const getMonthlySales = async (currency, lastNMonths = DISPLAY_NUM_MONTHS) => {
  const currentDate = new Date()

  const sales = []
  const months = []

  for (let i = 1; i <= lastNMonths; i++) {
    const start = getFirstDayOfMonth(currentDate, (lastNMonths - i) * -1)
    const end = getLastDayOfMonth(currentDate, (lastNMonths - i) * -1)
    var output = await _getSalesForMonth(start, end, currency);
    sales.push(output[0].sales)
    months.push(getMonthAsString(start))
  }

  return { sales, months }
}

export const getSalesByCustomer = async (currency) => {
  var deta = await getSalesByCustomerDeta(currency);
  const resultTopCustomers = deta[0]
  const resultOtherCustomers = deta[1]

  const result = resultOtherCustomers[0].sales
    ? resultTopCustomers.concat(resultOtherCustomers)
    : resultTopCustomers

  const sales = result.map(r => r.sales)
  const customers = result.map(r => r.customer)

  return { sales, customers }
}

export const getSalesByCustomerDeta = async (currency) => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value;
  var map = new Map();
  var array = [];
  var output = [];

  for (var i = 0; i < invoices.length; i++) {
    if (map.has(invoices[i].payor_uuid)) {
      var prev = map.get(invoices[i].payor_uuid);
      var obj = {};
      obj['customer'] = prev['customer'];
      obj['sales'] = prev['sales'] + invoices[i].total;
      map.set(invoices[i].payor_uuid, obj)
    } else {
      var obj = {};
      obj['customer'] = invoices[i].payor_name;
      obj['sales'] = invoices[i].total;
      map.set(invoices[i].payor_uuid, obj)
    }
  }

  map.forEach((value, key) => {
    array.push({'customer': value.customer, 'sales': value.sales});
  })

  function compare(a, b) {
    const bandA = a.sales;
    const bandB = b.sales;
  
    let comparison = 0;
    if (bandA > bandB) {
      comparison = -1;
    } else if (bandA < bandB) {
      comparison = 1;
    }
    return comparison;
  }

  array.sort(compare);

  var others = 0;
  var first = false;
  var other = [];

  for (var i = 0; i < array.length; i++) {
    if (i < DISPLAY_NUM_RANKS) {
      output.push({'customer': array[i].customer, 'sales': array[i].sales, 'rank': i + 1});
    } else {
      first = true;
      others += array[i].sales;
    }
  }

  other.push({
    'customer': "Others",
    'sales': first ? others : null
  })

  return [output, other];
}

export const getSalesByProduct = async (currency) => {
  const output = await getSalesByProductDeta(currency);
  const resultTopProducts = output[0]
  const resultOtherProducts = output[1]

  const result = resultOtherProducts[0].sales
    ? resultTopProducts.concat(resultOtherProducts)
    : resultTopProducts

  const sales = result.map(r => r.sales)
  const products = result.map(r => r.product)

  return { sales, products }
}

export const getSalesByProductDeta = async (currency) => {
  var invoice_item = await invoice_item_db.fetch().next();
  invoice_item = invoice_item.value;
  var map = new Map();
  var array = [];
  var output = [];

  for (var i = 0; i < invoice_item.length; i++) {
    if (map.has(invoice_item[i].item_name.toLowerCase())) {
      var prev = map.get(invoice_item[i].item_name.toLowerCase());
      var obj = {
        'product': prev['product'],
        'sales': prev['sales'] + invoice_item[i].unit_price * invoice_item[i].quantity
      };
      map.set(invoice_item[i].item_name.toLowerCase(), obj)
    } else {
      var obj = {
        'product': invoice_item[i].item_name,
        'sales': invoice_item[i].unit_price * invoice_item[i].quantity
      };
      map.set(invoice_item[i].item_name.toLowerCase(), obj)
    }
  }
  
  map.forEach((value, key) => {
    array.push({'product': value.product, 'sales': value.sales});
  })

  function compare(a, b) {
    const bandA = a.sales;
    const bandB = b.sales;
  
    let comparison = 0;
    if (bandA > bandB) {
      comparison = -1;
    } else if (bandA < bandB) {
      comparison = 1;
    }
    return comparison;
  }

  array.sort(compare);

  var others = 0;
  var first = false;
  var other = [];

  for (var i = 0; i < array.length; i++) {
    if (i < DISPLAY_NUM_RANKS) {
      output.push({'product': array[i].product, 'sales': array[i].sales, 'rank': i + 1});
    } else {
      first = true;
      others += array[i].sales;
    }
  }

  other.push({
    'product': "Others",
    'sales': first ? others : null
  })

  return [output, other];
}

export const getTotals = async (currency) => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value;
  var received = 0;
  var owed = 0;
  var overdue = 0;
  var total = 0;
  const dateToday = new Date().toISOString()

  for (var i = 0; i < invoices.length; i++) {
    total += invoices[i].total;
    received += invoices[i].date_paid ? invoices[i].total : 0;
    owed += invoices[i].date_paid ? 0 : invoices[i].total;
    overdue += invoices[i].date_due && invoices[i].date_paid === null && invoices[i].date_due < dateToday ? invoices[i].total : 0;
  }

  return {'total': total, 'received': received, 'owed': owed, 'overdue': overdue};
}

export const getCustomerCount = async () => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value;

  var total = new Set();
  for (var i = 0; i < invoices.length; i++) {
    total.add(invoices[i].payor_uuid);
  }

  return total.size;
}