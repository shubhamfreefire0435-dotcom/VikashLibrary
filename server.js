require('dotenv').config();
const fs=require('fs'),path=require('path'),crypto=require('crypto'),express=require('express'),helmet=require('helmet'),compression=require('compression'),rateLimit=require('express-rate-limit'),multer=require('multer'),bcrypt=require('bcryptjs'),db=require('./src/db'),{sign,auth,roles}=require('./src/auth');
const app=express(),PORT=Number(process.env.PORT||5000),DATA=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data'),UP=path.join(DATA,'uploads'),PUB=path.join(__dirname,'public');
if((process.env.JWT_SECRET||'').length<32){console.error('Set JWT_SECRET to 32+ characters in .env');process.exit(1)}
fs.mkdirSync(UP,{recursive:true});app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false}));app.use(compression());app.use(express.json({limit:'1mb'}));app.use(express.urlencoded({extended:true}));app.use('/uploads',express.static(UP,{maxAge:'1h'}));app.use(express.static(PUB));
const limiter=rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false});
const txt=(v,n=500)=>String(v??'').trim().slice(0,n),settings=()=>Object.fromEntries(db.prepare('SELECT setting_key,setting_value FROM settings').all().map(x=>[x.setting_key,x.setting_value]));
const admin=db.prepare("SELECT id FROM users WHERE role='admin'").get();if(!admin&&process.env.ADMIN_USERNAME&&String(process.env.ADMIN_PASSWORD||'').length>=12){db.prepare("INSERT INTO users(username,password_hash,full_name,role,status) VALUES(?,?,?,'admin','active')").run(txt(process.env.ADMIN_USERNAME,80),bcrypt.hashSync(process.env.ADMIN_PASSWORD,12),'Library Administrator');console.log('Initial admin account created from environment variables.')}
function upload(folder,exts){const dir=path.join(UP,folder);fs.mkdirSync(dir,{recursive:true});return multer({storage:multer.diskStorage({destination:dir,filename:(_r,f,cb)=>cb(null,crypto.randomUUID()+path.extname(f.originalname).toLowerCase())}),limits:{fileSize:Number(process.env.MAX_UPLOAD_MB||5)*1024*1024},fileFilter:(_r,f,cb)=>{const e=path.extname(f.originalname).toLowerCase();cb(exts.includes(e)?null:new Error('Unsupported file type.'),exts.includes(e))}})}
const appFiles=upload('applications',['.jpg','.jpeg','.png','.webp','.pdf']),images=upload('images',['.jpg','.jpeg','.png','.webp','.gif']),docs=upload('documents',['.pdf','.jpg','.jpeg','.png','.webp']);
app.get('/api/status',(_q,r)=>r.json({status:'ONLINE',service:'VIKASH LIBRARY'}));
app.get('/api/public/settings',(_q,r)=>r.json({settings:settings()}));
app.get('/api/public/notices',(_q,r)=>r.json({notices:db.prepare("SELECT id,title,body,image_path,created_at FROM notices WHERE is_published=1 AND audience='public' ORDER BY id DESC LIMIT 30").all()}));
app.post('/api/auth/login',limiter,async(q,r)=>{const u=db.prepare('SELECT * FROM users WHERE username=?').get(txt(q.body.username,80));if(!u||u.status!=='active'||!await bcrypt.compare(String(q.body.password||''),u.password_hash))return r.status(401).json({message:'Invalid username or password.'});const {password_hash,...safe}=u;r.json({token:sign(u),user:safe})});
app.get('/api/auth/me',auth,(q,r)=>r.json({user:q.user}));
app.post('/api/auth/forgot-password',limiter,(q,r)=>{const u=db.prepare("SELECT id,username FROM users WHERE username=? AND status='active'").get(txt(q.body.username,80));if(u){const raw=crypto.randomBytes(32).toString('hex'),hash=crypto.createHash('sha256').update(raw).digest('hex');db.prepare('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)').run(u.id,hash,Date.now()+1800000);const link=`${(process.env.PUBLIC_BASE_URL||`http://localhost:${PORT}`).replace(/\/$/,'')}/reset-password.html?token=${raw}`;if(process.env.NODE_ENV!=='production')console.log('DEV PASSWORD RESET LINK:',link);else console.warn('Password reset requested but email delivery is not configured. Configure mail delivery before production use.')}r.json({message:'If an account exists, reset instructions will be sent.'})});
app.post('/api/auth/reset-password',limiter,(q,r)=>{const token=txt(q.body.token,200),pw=String(q.body.password||'');if(pw.length<12)return r.status(400).json({message:'Password must be at least 12 characters.'});const hash=crypto.createHash('sha256').update(token).digest('hex'),x=db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?').get(hash,Date.now());if(!x)return r.status(400).json({message:'Reset link is invalid or expired.'});const tx=db.transaction(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pw,12),x.user_id);db.prepare('UPDATE password_resets SET used_at=? WHERE id=?').run(Date.now(),x.id)});tx();r.json({message:'Password updated. You can log in now.'})});
app.post('/api/applications',limiter,appFiles.fields([{name:'photo',maxCount:1},{name:'document',maxCount:1}]),(q,r)=>{const b=q.body,name=txt(b.full_name,120),phone=txt(b.phone,30),address=txt(b.address,500);if(!name||!phone||!address)return r.status(400).json({message:'Name, phone and address are required.'});const code='VL-'+new Date().getFullYear()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(),photo=q.files?.photo?.[0],doc=q.files?.document?.[0];db.prepare(`INSERT INTO applications(application_code,full_name,dob,gender,phone,email,address,guardian_name,guardian_phone,education,school_college,occupation,emergency_contact,membership_plan,photo_path,document_path,document_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,name,txt(b.dob,20),txt(b.gender,30),phone,txt(b.email,160),address,txt(b.guardian_name,120),txt(b.guardian_phone,30),txt(b.education,120),txt(b.school_college,160),txt(b.occupation,120),txt(b.emergency_contact,30),txt(b.membership_plan,60),photo?'/uploads/applications/'+path.basename(photo.path):null,doc?'/uploads/applications/'+path.basename(doc.path):null,txt(b.document_type,60));r.status(201).json({message:'Application submitted.',application_code:code})});
app.get('/api/admin/dashboard-stats',auth,roles('admin'),(_q,r)=>{const c=s=>db.prepare(s).get().n;r.json({stats:{totalApplications:c('SELECT COUNT(*) n FROM applications'),pendingApplications:c("SELECT COUNT(*) n FROM applications WHERE status='pending'"),approvedApplications:c("SELECT COUNT(*) n FROM applications WHERE status='approved'"),rejectedApplications:c("SELECT COUNT(*) n FROM applications WHERE status='rejected'"),totalStudents:c("SELECT COUNT(*) n FROM users WHERE role='student'"),availableSeats:c("SELECT COUNT(*) n FROM seats WHERE status='available'")}})});
app.get('/api/admin/applications',auth,roles('admin'),(_q,r)=>r.json({applications:db.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT 500').all()}));
// Admin-only student profile, linked to the approved application
app.get('/api/admin/applications/:id/profile', auth, roles('admin'), (q, r) => {
  const id = Number(q.params.id);

  const application = db.prepare(`
    SELECT
      id, application_code, full_name, dob, gender, phone, email,
      address, guardian_name, guardian_phone, education,
      school_college, occupation, emergency_contact, membership_plan,
      photo_path, document_path, document_type, status, created_at,
      reviewed_at
    FROM applications
    WHERE id = ?
  `).get(id);

  if (!application) {
    return r.status(404).json({ message: 'Application not found.' });
  }

  const student = db.prepare(`
    SELECT id, username, full_name, phone, email, status, created_at
    FROM users
    WHERE username = ? AND role = 'student'
  `).get(application.application_code);

  const seat = student
    ? db.prepare(`
        SELECT seat_number, zone, status
        FROM seats
        WHERE assigned_user_id = ?
      `).get(student.id) || null
    : null;

  r.json({ application, student: student || null, seat });
});
app.post('/api/admin/applications/:id/approve',auth,roles('admin'),(q,r)=>{const a=db.prepare("SELECT * FROM applications WHERE id=? AND status='pending'").get(Number(q.params.id));if(!a)return r.status(404).json({message:'Pending application not found.'});let username=a.application_code;const pw=crypto.randomBytes(18).toString('base64url');const tx=db.transaction(()=>{const u=db.prepare("INSERT INTO users(username,password_hash,full_name,role,phone,email,status) VALUES(?,?,?,'student',?,?,'active')").run(username,bcrypt.hashSync(pw,12),a.full_name,a.phone,a.email);db.prepare("UPDATE applications SET status='approved',reviewed_by=?,reviewed_at=datetime('now') WHERE id=?").run(q.user.id,a.id);const s=db.prepare("SELECT id FROM seats WHERE status='available' ORDER BY seat_number LIMIT 1").get();if(s)db.prepare("UPDATE seats SET status='occupied',assigned_user_id=?,updated_at=datetime('now') WHERE id=?").run(u.lastInsertRowid,s.id);return u.lastInsertRowid});tx();r.json({message:'Approved; student account created. Ask the student to use Forgot Password to set a password.',username})});
app.post('/api/admin/applications/:id/reject',auth,roles('admin'),(q,r)=>{const x=db.prepare("UPDATE applications SET status='rejected',reviewed_by=?,reviewed_at=datetime('now') WHERE id=? AND status='pending'").run(q.user.id,Number(q.params.id));r.status(x.changes?200:404).json({message:x.changes?'Application rejected.':'Pending application not found.'})});
app.get('/api/admin/users',auth,roles('admin'),(q,r)=>{const role=txt(q.query.role,20);if(!['student','staff','editor','admin'].includes(role))return r.status(400).json({message:'Invalid role.'});r.json({users:db.prepare('SELECT id,username,full_name,role,phone,email,status,created_at FROM users WHERE role=? ORDER BY id DESC LIMIT 500').all(role)})});
app.post('/api/admin/users',auth,roles('admin'),(q,r)=>{const b=q.body,role=txt(b.role,20),pw=String(b.password||'');if(!txt(b.username,80)||!txt(b.full_name,120)||pw.length<12||!['student','staff','editor','admin'].includes(role))return r.status(400).json({message:'Username, name, valid role and password (12+ chars) required.'});try{db.prepare('INSERT INTO users(username,password_hash,full_name,role,phone,email,status) VALUES(?,?,?,?,?,?,?)').run(txt(b.username,80),bcrypt.hashSync(pw,12),txt(b.full_name,120),role,txt(b.phone,30),txt(b.email,160),'active');r.status(201).json({message:'Account created.'})}catch{r.status(409).json({message:'Username already exists.'})}});
app.patch('/api/admin/users/:id/status',auth,roles('admin'),(q,r)=>{const s=txt(q.body.status,20);if(!['active','inactive'].includes(s))return r.status(400).json({message:'Invalid status.'});if(Number(q.params.id)===q.user.id&&s==='inactive')return r.status(400).json({message:'Cannot disable your own account.'});const x=db.prepare('UPDATE users SET status=? WHERE id=?').run(s,Number(q.params.id));r.status(x.changes?200:404).json({message:x.changes?'Account updated.':'User not found.'})});
app.get('/api/admin/seats',auth,roles('admin','staff'),(_q,r)=>r.json({seats:db.prepare('SELECT s.*,u.full_name assigned_name FROM seats s LEFT JOIN users u ON u.id=s.assigned_user_id ORDER BY seat_number').all()}));
app.patch('/api/admin/seats/:id',auth,roles('admin'),(q,r)=>{const s=txt(q.body.status,20);if(!['available','occupied','maintenance'].includes(s))return r.status(400).json({message:'Invalid status.'});const x=db.prepare("UPDATE seats SET status=?,updated_at=datetime('now'),assigned_user_id=CASE WHEN ?='available' THEN NULL ELSE assigned_user_id END WHERE id=?").run(s,s,Number(q.params.id));r.status(x.changes?200:404).json({message:x.changes?'Seat updated.':'Seat not found.'})});
app.get('/api/admin/notices',auth,roles('admin','editor'),(_q,r)=>r.json({notices:db.prepare('SELECT * FROM notices ORDER BY id DESC LIMIT 300').all()}));
app.post('/api/admin/notices',auth,roles('admin','editor'),images.single('image'),(q,r)=>{const b=q.body,title=txt(b.title,160),body=txt(b.body,4000),aud=txt(b.audience,20);if(!title||!body||!['public','students','staff'].includes(aud))return r.status(400).json({message:'Title, body and audience are required.'});const image=q.file?'/uploads/images/'+path.basename(q.file.path):null;db.prepare('INSERT INTO notices(title,body,image_path,audience,is_published,created_by) VALUES(?,?,?,?,?,?)').run(title,body,image,aud,['true','1'].includes(b.is_published)?1:0,q.user.id);r.status(201).json({message:'Notice saved.'})});
app.patch('/api/admin/notices/:id',auth,roles('admin','editor'),(q,r)=>{const n=db.prepare('SELECT * FROM notices WHERE id=?').get(Number(q.params.id));if(!n)return r.status(404).json({message:'Notice not found.'});const b=q.body;db.prepare('UPDATE notices SET is_published=? WHERE id=?').run(['true','1'].includes(b.is_published)?1:0,n.id);r.json({message:'Notice status updated.'})});
app.delete('/api/admin/notices/:id',auth,roles('admin','editor'),(q,r)=>{const x=db.prepare('DELETE FROM notices WHERE id=?').run(Number(q.params.id));r.status(x.changes?200:404).json({message:x.changes?'Notice deleted.':'Notice not found.'})});
app.put('/api/admin/settings',auth,roles('admin','editor'),(q,r)=>{const allow=new Set(['library_name','tagline','address','phone','email','logo_path','home_title','home_text','capacity']),save=db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value');const tx=db.transaction(()=>Object.entries(q.body.settings||{}).forEach(([k,v])=>{if(allow.has(k))save.run(k,txt(v,2000))}));tx();r.json({message:'Settings saved.',settings:settings()})});
app.post('/api/admin/logo',auth,roles('admin','editor'),images.single('logo'),(q,r)=>{if(!q.file)return r.status(400).json({message:'Choose a logo image.'});const p='/uploads/images/'+path.basename(q.file.path);db.prepare("INSERT INTO settings VALUES('logo_path',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value").run(p);r.json({message:'Logo changed.',logo_path:p})});
app.delete('/api/admin/logo',auth,roles('admin','editor'),(q,r)=>{const old=settings().logo_path;if(old.startsWith('/uploads/images/'))try{fs.unlinkSync(path.join(UP,path.basename(old)))}catch{}db.prepare("UPDATE settings SET setting_value='' WHERE setting_key='logo_path'").run();r.json({message:'Logo deleted.'})});
app.get('/api/admin/documents',auth,roles('admin','staff'),(_q,r)=>r.json({documents:db.prepare('SELECT id,title,description,category,original_name,created_at FROM documents ORDER BY id DESC LIMIT 300').all()}));
app.post('/api/admin/documents',auth,roles('admin','staff'),docs.single('file'),(q,r)=>{if(!q.file||!txt(q.body.title,160))return r.status(400).json({message:'Title and file required.'});db.prepare('INSERT INTO documents(title,description,category,file_path,original_name,uploaded_by) VALUES(?,?,?,?,?,?)').run(txt(q.body.title,160),txt(q.body.description,1000),txt(q.body.category,60)||'general','/uploads/documents/'+path.basename(q.file.path),path.basename(q.file.originalname),q.user.id);r.status(201).json({message:'Document uploaded.'})});
app.get('/api/admin/documents/:id/download',auth,roles('admin','staff'),(q,r)=>{const d=db.prepare('SELECT * FROM documents WHERE id=?').get(Number(q.params.id));if(!d)return r.status(404).json({message:'Document not found.'});const p=path.join(UP,'documents',path.basename(d.file_path));if(!fs.existsSync(p))return r.status(404).json({message:'File missing.'});r.download(p,d.original_name)});

/* ADMIN PAYMENT MANAGEMENT */

app.get('/api/admin/payments', auth, roles('admin'), (q, r) => {
  const payments = db.prepare(`
    SELECT p.id, p.student_id, p.amount, p.payment_date,
           p.payment_method, p.reference, p.status,
           u.full_name, u.username
    FROM payments p
    LEFT JOIN users u ON u.id = p.student_id
    ORDER BY p.id DESC
    LIMIT 500
  `).all();

  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS collected,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending,
      COUNT(*) AS total
    FROM payments
  `).get();

  r.json({ payments, summary });
});

app.post('/api/admin/payments', auth, roles('admin'), (q, r) => {
  const b = q.body || {};
  const studentId = Number(b.student_id);
  const amount = Number(b.amount);
  const date = txt(b.payment_date, 20) || new Date().toISOString().slice(0, 10);
  const method = txt(b.payment_method, 30);
  const status = txt(b.status, 20);
  const reference = txt(b.reference, 100);

  if (!Number.isInteger(studentId) || !Number.isFinite(amount) ||
      amount <= 0 || !['cash', 'upi', 'bank_transfer', 'other'].includes(method) ||
      !['paid', 'pending'].includes(status) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return r.status(400).json({ message: 'Please enter valid payment details.' });
  }

  const student = db.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'student'"
  ).get(studentId);

  if (!student) {
    return r.status(404).json({ message: 'Student account not found.' });
  }

  db.prepare(`
    INSERT INTO payments
      (student_id, amount, payment_date, payment_method, reference, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(studentId, amount, date, method, reference || null, status);

  r.status(201).json({ message: 'Payment record saved.' });
});
app.get('/api/admin/reports/summary',auth,roles('admin'),(_q,r)=>{const c=s=>db.prepare(s).get().n;r.json({summary:{students:c("SELECT COUNT(*) n FROM users WHERE role='student'"),staff:c("SELECT COUNT(*) n FROM users WHERE role='staff'"),applications:c('SELECT COUNT(*) n FROM applications'),attendance:c('SELECT COUNT(*) n FROM attendance'),payments:c('SELECT COUNT(*) n FROM payments'),seats:c('SELECT COUNT(*) n FROM seats'),availableSeats:c("SELECT COUNT(*) n FROM seats WHERE status='available'")}})});
app.get('/api/student/dashboard',auth,roles('student'),(q,r)=>r.json({user:q.user,seat:db.prepare('SELECT seat_number,zone,status FROM seats WHERE assigned_user_id=?').get(q.user.id)||null,attendance:db.prepare('SELECT attendance_date,status,check_in FROM attendance WHERE student_id=? ORDER BY attendance_date DESC LIMIT 60').all(q.user.id),payments:db.prepare('SELECT amount,payment_date,payment_method,reference,status FROM payments WHERE student_id=? ORDER BY payment_date DESC LIMIT 60').all(q.user.id),notices:db.prepare("SELECT id,title,body,image_path,created_at FROM notices WHERE is_published=1 AND audience IN('public','students') ORDER BY id DESC LIMIT 30").all()}));
app.use((err,_q,r,_n)=>{console.error(err.message);r.status(400).json({message:err instanceof multer.MulterError?'File upload failed or file too large.':err.message||'Request failed.'})});
app.use((q,r)=>q.path.startsWith('/api/')?r.status(404).json({message:'API endpoint not found.'}):r.status(404).sendFile(path.join(PUB,'404.html')));
app.listen(PORT,()=>console.log(`VIKASH LIBRARY running on http://localhost:${PORT}`));
