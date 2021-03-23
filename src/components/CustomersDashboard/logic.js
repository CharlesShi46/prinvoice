import {Deta} from 'deta'

const deta = Deta('YOUR_KEY_HERE'); 
const invoices_db = deta.Base('invoices_db');

export const getCustomers = async () => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value
  let map = new Map()

  for (var i = 0; i < invoices.length; i++) {
    if (map.has(invoices[i].payor_uuid)) {
      var prev = map.get(invoices[i].payor_uuid);
      var obj = {
        'customer': prev['customer'],
        'email': prev['email'],
        'currency': prev['currency'],
        'amount_received': (invoices[i].date_paid ? invoices[i].total : 0) + prev['amount_received'],
        'amount_owes': (invoices[i].date_paid ? 0 : invoices[i].total) + prev['amount_owes']
      };
      map.set(invoices[i].payor_uuid, obj)
    } else {
      var obj = {
        'customer': invoices[i].payor_name,
        'email': invoices[i].payor_email ? invoices[i].payor_email : null,
        'currency': invoices[i].currency,
        'amount_received': invoices[i].date_paid ? invoices[i].total : 0,
        'amount_owes': invoices[i].date_paid ? 0 : invoices[i].total
      };
      map.set(invoices[i].payor_uuid, obj)
    }
  }

  let values = Array.from(map.values());
  return values;
} 