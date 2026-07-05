import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);

const services = ['91club', '55club', 'in999', 'jaiclub', 'jalwa', 'okwin', 'yaarwin', 'dhaniwin', 'lottery7', '51game'];

try {
  const result = await mongoose.connection.db.collection('services').find({
    code: { $in: services }
  }).project({ code: 1, name: 1, formate: 1, _id: 0 }).sort({ code: 1 }).toArray();

  console.log('SERVICE FORMATS:');
  console.log('================\n');
  for (const service of result) {
    console.log(`📱 ${service.code.toUpperCase()} - ${service.name}`);
    if (service.formate && service.formate.length > 0) {
      service.formate.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    } else {
      console.log('   (no formats defined)');
    }
    console.log('');
  }
} catch (err) {
  console.error('Error:', err.message);
} finally {
  await mongoose.disconnect();
}
