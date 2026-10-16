#define _GNU_SOURCE
#include <node_api.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#ifdef __linux__
#include <sys/syscall.h>
#include <linux/fs.h>
#endif

static napi_value fail(napi_env e, const char *what) {
  char msg[256]; snprintf(msg,sizeof(msg),"%s: %s",what,strerror(errno));
  const char *code="ERR_SAFE_FS";
  switch(errno) {
#define ERRNO_CASE(x) case x: code=#x; break;
    ERRNO_CASE(ENOENT) ERRNO_CASE(EEXIST) ERRNO_CASE(EACCES) ERRNO_CASE(EPERM)
    ERRNO_CASE(ELOOP) ERRNO_CASE(ENOTDIR) ERRNO_CASE(EISDIR) ERRNO_CASE(EINVAL)
    ERRNO_CASE(EBADF) ERRNO_CASE(ENOSPC) ERRNO_CASE(EXDEV) ERRNO_CASE(ENOTEMPTY) ERRNO_CASE(EIO)
  }
  napi_throw_error(e,code,msg); return NULL;
}
static int integer(napi_env e,napi_value v) { int32_t n=-1; napi_get_value_int32(e,v,&n); return n; }
static char *string(napi_env e,napi_value v) {
  size_t n=0; if(napi_get_value_string_utf8(e,v,NULL,0,&n)!=napi_ok) { napi_throw_type_error(e,NULL,"Expected string"); return NULL; }
  char *s=malloc(n+1); if(!s) { errno=ENOMEM; fail(e,"allocate"); return NULL; }
  napi_get_value_string_utf8(e,v,s,n+1,&n);
  if(strlen(s)!=n) { free(s); napi_throw_error(e,NULL,"NUL is forbidden"); return NULL; } return s;
}
static char *component(napi_env e,napi_value v) {
  char *s=string(e,v); if(!s)return NULL;
  if(!*s||!strcmp(s,".")||!strcmp(s,"..")||strchr(s,'/')) { free(s); napi_throw_error(e,NULL,"Expected one safe path component"); return NULL; } return s;
}
static napi_value number(napi_env e,int n) { napi_value v; napi_create_int32(e,n,&v); return v; }
static napi_value open_root(napi_env e,napi_callback_info info) {
  napi_value a[1]; size_t n=1; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  char *p=string(e,a[0]); if(!p)return NULL;
  if(p[0]!='/') { free(p); napi_throw_error(e,NULL,"Root must be absolute"); return NULL; }
  int fd=open("/",O_RDONLY|O_DIRECTORY|O_CLOEXEC); if(fd<0) { free(p); return fail(e,"open root"); }
  char *save=NULL; char *part=strtok_r(p,"/",&save);
  while(part) {
    if(!strcmp(part,".")||!strcmp(part,"..")) { close(fd); free(p); napi_throw_error(e,NULL,"Unsafe root component"); return NULL; }
    int next=openat(fd,part,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC); int saved=errno; close(fd);
    if(next<0) { free(p); errno=saved; return fail(e,"open root component"); } fd=next; part=strtok_r(NULL,"/",&save);
  }
  free(p); return number(e,fd);
}
static napi_value open_at(napi_env e,napi_callback_info info) {
  napi_value a[7]; size_t n=7; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  if(n<7) { napi_throw_type_error(e,NULL,"Invalid native open arguments"); return NULL; }
  int parent=integer(e,a[0]); char *name=component(e,a[1]); if(!name)return NULL;
  int directory=integer(e,a[2]), create=integer(e,a[3]), exclusive=integer(e,a[4]);
  int flags=O_CLOEXEC|O_NOFOLLOW|O_NONBLOCK|(directory ? O_RDONLY|O_DIRECTORY : (integer(e,a[6]) ? O_RDWR : O_RDONLY));
  if(create) flags |= O_CREAT;
  if(exclusive) flags |= O_EXCL;
  int fd=openat(parent,name,flags,(mode_t)integer(e,a[5])); int saved=errno; free(name);
  if(fd<0) { errno=saved; return fail(e,"open component"); }
  struct stat st; if(fstat(fd,&st)<0 || (directory ? !S_ISDIR(st.st_mode) : !S_ISREG(st.st_mode))) { close(fd); errno=EINVAL; return fail(e,"Unexpected file type"); }
  return number(e,fd);
}
static napi_value mutate(napi_env e,napi_callback_info info) {
  napi_value a[5]; size_t n=5; void *data; napi_get_cb_info(e,info,&n,a,NULL,&data);
  int fd=integer(e,a[0]); char *name=component(e,a[1]); if(!name)return NULL;
  intptr_t op=(intptr_t)data; int rc=-1;
  if(op==0) rc=mkdirat(fd,name,(mode_t)integer(e,a[2]));
  else if(op==1||op==2)rc=unlinkat(fd,name,op==2?AT_REMOVEDIR:0);
  else { char *dest=component(e,a[3]); if(!dest) { free(name); return NULL; } rc=renameat(fd,name,integer(e,a[2]),dest); free(dest); }
  int saved=errno; free(name); if(rc<0) { errno=saved; return fail(e,"relative mutation"); } return number(e,0);
}
static napi_value rename_exclusive(napi_env e,napi_callback_info info) {
  napi_value a[4]; size_t n=4; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  if(n!=4) { napi_throw_type_error(e,NULL,"Expected source and destination handles and names"); return NULL; }
  char *source=component(e,a[1]); if(!source)return NULL;
  char *destination=component(e,a[3]); if(!destination) { free(source); return NULL; }
  int rc;
#ifdef __APPLE__
  rc=renameatx_np(integer(e,a[0]),source,integer(e,a[2]),destination,RENAME_EXCL);
#elif defined(__linux__) && defined(SYS_renameat2)
  rc=(int)syscall(SYS_renameat2,integer(e,a[0]),source,integer(e,a[2]),destination,RENAME_NOREPLACE);
#else
  errno=ENOTSUP; rc=-1;
#endif
  int saved=errno; free(source); free(destination);
  if(rc<0) { errno=saved; return fail(e,"atomic no-replace rename"); }
  return number(e,0);
}
static napi_value set_times(napi_env e,napi_callback_info info) {
  napi_value a[3]; size_t n=3; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  if(n<3) { napi_throw_type_error(e,NULL,"Expected descriptor and nanosecond times"); return NULL; }
  struct timespec times[2];
  for(int i=0;i<2;i++) {
    int64_t ns; bool lossless;
    if(napi_get_value_bigint_int64(e,a[i+1],&ns,&lossless)!=napi_ok || !lossless) {
      napi_throw_type_error(e,NULL,"Timestamp must be a signed 64-bit BigInt in nanoseconds"); return NULL;
    }
    times[i].tv_sec=ns/1000000000; times[i].tv_nsec=ns%1000000000;
    if(times[i].tv_nsec<0) { times[i].tv_sec--; times[i].tv_nsec+=1000000000; }
  }
  if(futimens(integer(e,a[0]),times)<0)return fail(e,"set descriptor timestamps");
  return number(e,0);
}
static napi_value symlink_at(napi_env e,napi_callback_info info) {
  napi_value a[3]; size_t n=3; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  char *name=component(e,a[1]); if(!name)return NULL;
  char *target=string(e,a[2]); if(!target) { free(name); return NULL; }
  int rc=symlinkat(target,integer(e,a[0]),name); int saved=errno; free(name); free(target);
  if(rc<0) { errno=saved; return fail(e,"create symlink"); } return number(e,0);
}
static napi_value read_link(napi_env e,napi_callback_info info) {
  napi_value a[2],v; size_t n=2; napi_get_cb_info(e,info,&n,a,NULL,NULL); char *s=component(e,a[1]); if(!s)return NULL;
  char buf[65536]; ssize_t len=readlinkat(integer(e,a[0]),s,buf,sizeof(buf)); int saved=errno; free(s);
  if(len<0) { errno=saved; return fail(e,"readlink"); } if(len==sizeof(buf)) { errno=ENAMETOOLONG; return fail(e,"readlink"); }
  napi_create_string_utf8(e,buf,len,&v); return v;
}
static napi_value list(napi_env e,napi_callback_info info) {
  napi_value a[1],result; size_t n=1; napi_get_cb_info(e,info,&n,a,NULL,NULL);
  int fd=openat(integer(e,a[0]),".",O_RDONLY|O_DIRECTORY|O_CLOEXEC); if(fd<0)return fail(e,"read directory");
  DIR *d=fdopendir(fd); if(!d) { close(fd); return fail(e,"read directory"); }
  napi_create_array(e,&result); unsigned i=0; struct dirent *entry; int saved=0;
  for(;;) {
    /* N-API conversion may change errno. Only readdir's EOF/error owns it. */
    errno=0; entry=readdir(d); if(!entry) { saved=errno; break; }
    if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;
    napi_value v; napi_create_string_utf8(e,entry->d_name,NAPI_AUTO_LENGTH,&v); napi_set_element(e,result,i++,v);
  }
  closedir(d); if(saved) { errno=saved; return fail(e,"read directory"); } return result;
}
static napi_value stat_at(napi_env e,napi_callback_info info) {
  napi_value a[2],o; size_t n=2; napi_get_cb_info(e,info,&n,a,NULL,NULL); char *s=component(e,a[1]); if(!s)return NULL;
  struct stat st; int rc=fstatat(integer(e,a[0]),s,&st,AT_SYMLINK_NOFOLLOW); int saved=errno; free(s); if(rc<0) { errno=saved; return fail(e,"lstat"); }
  napi_create_object(e,&o);
#define FIELD(k,value) { napi_value v; napi_create_bigint_int64(e,(int64_t)(value),&v); napi_set_named_property(e,o,k,v); }
  FIELD("dev",st.st_dev); FIELD("ino",st.st_ino); FIELD("mode",st.st_mode); FIELD("size",st.st_size);
  FIELD("nlink",st.st_nlink); FIELD("uid",st.st_uid); FIELD("gid",st.st_gid);
#ifdef __APPLE__
  int64_t atime=(int64_t)st.st_atimespec.tv_sec*1000000000+st.st_atimespec.tv_nsec;
  int64_t mtime=(int64_t)st.st_mtimespec.tv_sec*1000000000+st.st_mtimespec.tv_nsec;
  int64_t ctime=(int64_t)st.st_ctimespec.tv_sec*1000000000+st.st_ctimespec.tv_nsec;
  FIELD("birthtimeNs",(int64_t)st.st_birthtimespec.tv_sec*1000000000+st.st_birthtimespec.tv_nsec);
#else
  int64_t atime=(int64_t)st.st_atim.tv_sec*1000000000+st.st_atim.tv_nsec;
  int64_t mtime=(int64_t)st.st_mtim.tv_sec*1000000000+st.st_mtim.tv_nsec;
  int64_t ctime=(int64_t)st.st_ctim.tv_sec*1000000000+st.st_ctim.tv_nsec;
#endif
  FIELD("atimeNs",atime); FIELD("mtimeNs",mtime); FIELD("ctimeNs",ctime);
  FIELD("atimeMs",atime/1000000); FIELD("mtimeMs",mtime/1000000); FIELD("ctimeMs",ctime/1000000);
  return o;
}
static napi_value init(napi_env e,napi_value exports) {
  struct { const char *name; napi_callback cb; intptr_t data; } f[]={ {"openRoot",open_root,0},{"openAt",open_at,0},{"mkdir",mutate,0},{"unlink",mutate,1},{"rmdir",mutate,2},{"rename",mutate,3},{"renameExclusive",rename_exclusive,0},{"setTimes",set_times,0},{"symlink",symlink_at,0},{"readlink",read_link,0},{"readDir",list,0},{"lstat",stat_at,0} };
  for(unsigned i=0;i<sizeof(f)/sizeof(f[0]);i++) { napi_value v; napi_create_function(e,f[i].name,NAPI_AUTO_LENGTH,f[i].cb,(void*)f[i].data,&v); napi_set_named_property(e,exports,f[i].name,v); } return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
