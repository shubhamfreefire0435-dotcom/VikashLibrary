const jwt=require('jsonwebtoken'),db=require('./db');
function sign(user){return jwt.sign({sub:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'8h',issuer:'vikash-library'});}
function auth(req,res,next){const h=req.headers.authorization||'',t=h.startsWith('Bearer ')?h.slice(7):'';if(!t)return res.status(401).json({message:'Please log in.'});try{const p=jwt.verify(t,process.env.JWT_SECRET,{issuer:'vikash-library'}),u=db.prepare('SELECT id,username,full_name,role,status,email,phone FROM users WHERE id=?').get(p.sub);if(!u||u.status!=='active')return res.status(401).json({message:'Account unavailable.'});req.user=u;next()}catch{return res.status(401).json({message:'Session expired. Please log in again.'})}}
function roles(...r){return(req,res,next)=>req.user&&r.includes(req.user.role)?next():res.status(403).json({message:'Permission denied.'})}
module.exports={sign,auth,roles};
