#define _DARWIN_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#include <sys/types.h>
#include <dirent.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stddef.h>
/* Normal scans use real libc against a real temporary tree. N-API has no
 * contract to preserve errno; deliberately clobber it per entry. Error-mode
 * injects one explicit EIO at the readdir boundary, without changing errno
 * after a successful real read. */
typedef void *napi_env;
typedef void *napi_callback_info;
typedef void *napi_value;
#define NAPI_AUTO_LENGTH SIZE_MAX
static int input_fd,last_error,entry_count,break_stream;
static struct dirent *read_entry(DIR *directory){if(break_stream){errno=EIO;return NULL;}return readdir(directory);}
#define readdir read_entry
static void napi_get_cb_info(napi_env e,napi_callback_info i,size_t *n,napi_value *a,void *r,void *d){a[0]=&input_fd;}
static int integer(napi_env e,napi_value value){return *(int *)value;}
static void napi_create_array(napi_env e,napi_value *result){*result=&entry_count;}
static void napi_create_string_utf8(napi_env e,const char *name,size_t n,napi_value *value){*value=(void *)name;errno=316;}
static void napi_set_element(napi_env e,napi_value result,unsigned i,napi_value value){entry_count++;errno=316;}
static napi_value fail(napi_env e,const char *what){last_error=errno;return NULL;}
/* PRODUCTION_LIST */
int main(int argc,char **argv){input_fd=open(argv[1],O_RDONLY|O_DIRECTORY);if(input_fd<0)return 2;break_stream=argc>2;void *result=list(NULL,NULL);printf("%d %d %d\n",result!=NULL,entry_count,last_error);close(input_fd);return 0;}
