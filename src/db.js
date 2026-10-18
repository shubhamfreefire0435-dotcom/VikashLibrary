const fs=require('fs'),path=require('path'),DB=require('better-sqlite3');
const dir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'..','data');
fs.mkdirSync(path.join(dir,'uploads'),{recursive:true});
const db=new DB(path.join(dir,'library.sqlite'));db.pragma('journal_mode = WAL');db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,full_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','editor','staff','student')),phone TEXT,email TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY,application_code TEXT UNIQUE NOT NULL,full_name TEXT NOT NULL,dob TEXT,gender TEXT,phone TEXT NOT NULL,email TEXT,address TEXT NOT NULL,guardian_name TEXT,guardian_phone TEXT,education TEXT,school_college TEXT,occupation TEXT,emergency_contact TEXT,membership_plan TEXT,photo_path TEXT,document_path TEXT,document_type TEXT,status TEXT NOT NULL DEFAULT 'pending',reviewed_by INTEGER,reviewed_at TEXT,created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS seats(id INTEGER PRIMARY KEY,seat_number TEXT UNIQUE NOT NULL,zone TEXT DEFAULT 'General',status TEXT DEFAULT 'available',assigned_user_id INTEGER,updated_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,image_path TEXT,audience TEXT DEFAULT 'public',is_published INTEGER DEFAULT 0,created_by INTEGER,created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS attendance(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL,attendance_date TEXT NOT NULL,status TEXT DEFAULT 'present',check_in TEXT,created_at TEXT DEFAULT(datetime('now')),UNIQUE(student_id,attendance_date));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL,amount REAL NOT NULL,payment_date TEXT DEFAULT(date('now')),payment_method TEXT DEFAULT 'cash',reference TEXT,status TEXT DEFAULT 'paid',created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY,title TEXT NOT NULL,description TEXT,category TEXT DEFAULT 'general',file_path TEXT NOT NULL,original_name TEXT NOT NULL,uploaded_by INTEGER,created_at TEXT DEFAULT(datetime('now')));
CREATE TABLE IF NOT EXISTS password_resets(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,created_at TEXT DEFAULT(datetime('now')));
`);
const defaults={library_name:'VIKASH LIBRARY',tagline:'A better place to focus, learn and grow.',address:'Bichhiyan, Durgawati, Kaimur, Bihar, India',phone:'',email:'',logo_path:'',home_title:'Your goals deserve a quiet place.',home_text:'A focused, comfortable study space for your next big step.',capacity:'50'};
const s=db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)');for(const [k,v] of Object.entries(defaults))s.run(k,v);
const seat=db.prepare('INSERT OR IGNORE INTO seats(seat_number,zone) VALUES(?,?)');for(let i=1;i<=50;i++)seat.run('S'+String(i).padStart(2,'0'),i<=25?'Zone A':'Zone B');
module.exports=db;
