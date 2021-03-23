import {Deta} from 'deta'

const deta = Deta('YOUR_KEY_HERE'); 
const invoices_db = deta.Base('invoices_db');
const invoice_item_db = deta.Base('invoice_item_db');

export const getInvoices = async () => {
  var invoice = await invoices_db.fetch().next();
  invoice = invoice.value
  var invoice_item = await invoice_item_db.fetch().next();
  invoice_item = invoice_item.value

  for (var i = 0; i < invoice.length; i++) {
    var subtotal = 0;
    for (var j = 0; j < invoice_item.length; j++) {
      if (invoice[i].uuid === invoice_item[j].invoice_uuid) {
        subtotal += (invoice_item[j].unit_price * invoice_item[j].quantity)
      }
    }

    var total = (subtotal - invoice[i].discount) * (100 + invoice[i].tax_percent) / 100 + invoice[i].shipping;

    await invoices_db.put({
      'uuid': invoice[i].uuid,
      'key': invoice[i].key,
      'date_issued': invoice[i].date_issued,
      'date_due': invoice[i].date_due,
      'currency': invoice[i].currency,
      'discount': invoice[i].discount,
      'tax_percent': invoice[i].tax_percent,
      'shipping': invoice[i].shipping,
      'note': invoice[i].note,
      'payee_uuid': invoice[i].payee_uuid,
      'payee_name': invoice[i].payee_name,
      'payee_email': invoice[i].payee_email,
      'payor_name': invoice[i].payor_name,
      'payor_email': invoice[i].payor_email,
      'payor_uuid': invoice[i].payor_uuid,
      'subtotal': subtotal,
      'total': total,
      'created_date': invoice[i].created_date,
      'date_paid': invoice[i].date_paid
    })
  }

  invoice = await invoices_db.fetch().next();
  invoice = invoice.value

  function compare(a, b) {
    const bandA = a.date_issued;
    const bandB = b.date_issued;
  
    let comparison = 0;
    if (bandA > bandB) {
      comparison = -1;
    } else if (bandA < bandB) {
      comparison = 1;
    }
    return comparison;
  }

  invoice.sort(compare);
  return invoice;
}

export const getInvoiceItems = async (invoiceUuid) => {
  var invoice_items = await invoice_item_db.fetch().next();
  invoice_items = invoice_items.value;
  var output = [];
  for (var i = 0; i < invoice_items.length; i++) {
    if (invoice_items[i].invoice_uuid === invoiceUuid) {
      output.push(invoice_items[i])
    }
  }

  return output
}

export const getInvoiceObjectForExport = (invoice, invoiceItems) => {
  return {
    uuid: invoice.uuid,
    dateIssued: invoice.date_issued,
    dateDue: invoice.date_due,
    datePaid: invoice.date_paid,
    currency: invoice.currency,
    discount: invoice.discount,
    taxPercent: invoice.tax_percent,
    shipping: invoice.shipping,
    note: invoice.note,
    payor: {
      name: invoice.payor_name,
      email: invoice.payor_email,
      uuid: invoice.payor_uuid
    },
    payee: {
      name: invoice.payee_name,
      email: invoice.payee_email,
      uuid: invoice.payee_uuid
    },
    items: invoiceItems.map((item) => {
      return {
        name: item.item_name,
        quantity: item.quantity,
        unitPrice: item.unit_price
      }
    })
  }
}

export const setDatePaid = async (invoiceUuid, datePaid) => {
  var invoices = await invoices_db.fetch().next();
  invoices = invoices.value
  for (var i = 0; i < invoices.length; i++) {
    if (invoices[i].uuid === invoiceUuid) {
      const res = await invoices_db.update({
        'date_paid': datePaid ? datePaid.toISOString() : null
      }, invoiceUuid)
    }
  }
}

export const deleteInvoice = async (invoiceUuid) => {
  var invoice_item = await invoice_item_db.fetch().next();
  invoice_item = invoice_item.value

  for (var i = 0; i < invoice_item.length; i++) {
    if (invoice_item[i].invoice_uuid === invoiceUuid) {
      const res = await invoice_item_db.delete(invoice_item[i].key)
    }
  }

  const res_temp = await invoices_db.delete(invoiceUuid)
}