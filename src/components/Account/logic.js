import { Deta } from 'deta'

const deta = Deta('YOUR_KEY_HERE'); 
const user_db = deta.Base('user_db');

export const updateDefaultCurrency = (userId) => {
  user_db.put({
    'uuid': userId,
    'key': userId,
    'created_date': new Date().toISOString()
  })
}