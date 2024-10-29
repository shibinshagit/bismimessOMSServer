const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  plan: {
    type: [String],
    enum: ['B', 'L', 'D'],
    required: true
  },
  orderStart: { type: Date, required: true },
  orderEnd: { type: Date, required: true },
  leave: [{
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    numberOfLeaves: { type: Number, required: true, max: 8 }
  }],
  status: { 
    type: String, 
    enum: ['active', 'leave', 'expired','soon'], 
    required: true 
  },
  amount: { type: Number, },         
  paymentMethod: { 
    type: String, 
    enum: ['Cash', 'Bank', 'Online'], 
  },                                                 
  paymentId: { type: String,},       
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Completed'], 
    default: 'Pending' 
  },                                                  
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
