'use strict';
var exec = require('child_process').exec;
var http = require('http');
exports.name = 'clear';
exports.usage = '<command> [options]';
exports.desc = '清理分支';
exports.register = function(commander) {
    commander
        .option('-e, --verbose', '显示编译日志', Boolean, false)
        .option('-i, --ignore', '显示由于各种原因暂时不合并到master的分支', Boolean, false)
        .option('-n, --nomerged', '显示未合并到master的分支(不包含暂时不合并的)', Boolean, false)
        .option('-d, --delete', '删除2周未更新且已被合并到master的分支(v1)', Boolean, false)
        .option('-l, --list', '显示所有本地分支的任务状态', Boolean, false)
        .action(function () {
            var cmd = this;
            var arg0 = [].slice.call(arguments,-1)[0],
                argType = arguments;
            getConfFile();
            var ignoreBrArr = [],
            ignoreOption = fis.config.get("settings.clear.options");
            if(!ignoreOption){
                fis.log.notice("settings.clear.options配置不存在");
                return;
            }
            ignoreBrArr = ignoreOption.ignore;
            if(arg0.ignore){
                fis.log.notice(ignoreBrArr);
            }
            exec("git fetch -p",function(){
                if(arg0.nomerged){
                    exec('git branch --no-merged origin/master -a',function(err,stdout){
                        var branchArr = stdout.split("\n"),
                            leftArr = [],
                            clearType;
                        if(argType[0] && typeof argType[0] === "string"){
                            clearType = argType[0];
                        }
                        for(var i in branchArr){
                            var item = branchArr[i].trim(),
                                _item = item.replace("origin/",""),
                                index = ignoreBrArr.indexOf(_item);
                            if(index === -1 && (!clearType || (clearType && item.indexOf(clearType)>-1))){
                                leftArr.push(item);
                            }
                        }
                        filterActiveBranch(leftArr,arg0,true);
                    })
                    return;
                }
                if(arg0.list){
                    exec('git branch',function(err,stdout){
                        var branchArr = stdout.split("\n"),
                            leftArr = [];

                        for(var i in branchArr){
                            var item = branchArr[i].trim().replace("* ",""),
                                _item = item.replace("origin/",""),
                                index = ignoreBrArr.indexOf(_item);
                            if(index === -1){
                                leftArr.push(item);
                            }
                        }
                        filterActiveBranch(leftArr,arg0);
                    })
                    return;
                }
                exec('git log --pretty=format:"%h - %an, %ar : %s"',function(err, stdout, stderr, cb){
                    checkDelete(stdout,arg0);
                });
            })
        })
};
/**
 * @desc 过滤还在使用的分支
 * @param branchArr
 */
function filterActiveBranch(branchArr,arg0,isOutDate){
    if(isOutDate) {
        fis.log.notice("以下分支为未合并到master,并且多天未更新:");
    }
    checkActiveBranch(branchArr,arg0,isOutDate);
}

var requestStatus = {
    "1": "新建",
    "3": "已对接",
    "5": "已明确",
    "7": "开发中",
    "9": "开发完成",
    "11": "测试中",
    "13": "测试完成",
    "15": "已上线",
    "19": "已验收",
    "90": "取消",
    "99": "待定"
};
/**
 * @desc 检查该分支最近是否提交过(7天内)
 */
function checkActiveBranch(branchArr,arg0,isOutDate){
    var args = arguments;
    var branchName = branchArr.pop();
    //console.log(branchName);
    exec("git log -1 --format=%ct "+ branchName,function(err,stdout){
        var now = +new Date()/1000,
            date = parseInt(stdout),
            days = Math.round((now - date)/(3600 * 24));
        if(branchName &&(days >= 7 || branchName.indexOf("daily")>-1||!isOutDate)){
            var brName = branchName.replace("origin/","");
            fis.log.notice(brName.red+" :    "+days.toString().red+"天未更新");
            var regArr = /\/(\d+)$/.exec(brName);
            if(regArr && regArr[0]){
                var id = regArr[1];
                http.get("http://10.14.40.49/InterVacation/work/Json/TaskList?DTId="+id,function(res){
                    res.setEncoding('utf-8');
                    var responseText= "";
                    var size = 0;
                    res.on('data', function (data) {

                        responseText += data;
                        size+=data.length;
                    });
                    res.on('end', function () {
                        var item = JSON.parse(responseText)[0];
                        if(!item){
                            console.log("该分支没有找到对应的需求!");
                            checkActiveBranch.apply(this,args);
                            return;
                        }
                        item.status = requestStatus[""+item.DTStateId];
                        var msgTpl = " 需求名称: #{{DTId}}_{{DTName}},状态是: {{status}}",
                            msg = msgTpl.replace(/{{(\w+)}}/g,function($0,$1){
                                return item[$1];
                            });
                        console.log(msg);
                        checkActiveBranch.apply(this,args);
                    });
                })
            }else{
                checkActiveBranch.apply(this,args);
            }

        }else{
            logActiveBranch(branchArr,arg0);
        }

    })
}
function logActiveBranch(branchArr,arg0){
    if(branchArr.length > 0){
        checkActiveBranch(branchArr,arg0);
    }else{
        fis.log.notice("如果该分支已经过期,请使用"+"git push origin :xxxx".red+"来删除相应的分支!");
        fis.log.notice("如果该分支还有用,那么请在tch-conf.js里进行如下调整:");
        fis.log.notice("在settings.clear.options的ignore数组里增加分支名称.");
    }
}
function getConfFile(){
    var thisPath = fis.util.realpath(process.cwd()),
        filename = "tch-conf.js",
        confFilePath = thisPath+"/"+filename,
        cwd = thisPath,pos = cwd.length,
        root;
    do {
        cwd  = cwd.substring(0, pos);
        if(fis.util.exists(confFilePath)){
            root = cwd;
            break;
        } else {
            confFilePath = false;
            pos = cwd.lastIndexOf('/');
        }
    } while(pos > 0);
    if(!confFilePath){
        fis.log.error("当前目录不存在tch-conf配置文件,请进入对应的子目录下进行构建操作!");
        return;
    }
    fis.project.setProjectRoot(root);
    require(confFilePath);
}
function checkDelete(stdout,arg0){
    var matchArr = /([\w\d]+) - [\S ]+?2\sweeks\sago/.exec(stdout);
    var hash = matchArr && matchArr[1];
    if(hash){
        exec('git branch -a --merged '+hash,function(err,stdout,stderr,cb){
            var branchArr = [];
            if(stdout){
                console.log(stdout.green);
                fis.log.notice("以上分支为"+"2周".red+"前已被合并到"+"master".red+"的代码");
                if(!arg0.delete){
                    fis.log.notice("如果需要删除以上分支,请输入: "+"tch clear -d".red);
                }
                branchArr = stdout.split("\n");
                if(arg0.delete){
                    doDelete(branchArr);
                }
            }else{
                fis.log.notice("未发现需要清理的分支!");
                fis.log.notice("查看未合并到master的分支,请输入: "+"tch clear -n".red);
            }
        })
    }
}
function doDelete(branchArr){
    if(branchArr.length > 0){
        var branch = branchArr.pop();
        fis.log.notice("正在删除分支:  "+branch);
        if(branch){
            deleteFunc(branch,function(){
                doDelete(branchArr);
            });
        }else{
            doDelete(branchArr);
        }

    }else{
        process.exit();
    }
}
function read(prompt, callback) {
    process.stdout.write(prompt + ':');
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', function(chunk) {
        process.stdin.pause();
        callback(chunk);
    });
}
function deleteFunc(branchName,callback){
    var args = arguments;
    if(branchName.indexOf("remotes")>-1){
        var remoteBranch = branchName.trim().replace("remotes/origin/","");
        exec("git push origin :"+remoteBranch,function(err,stdout,stderr,cb){
            if(!err){
                fis.log.notice("成功删除"+remoteBranch);
                callback && callback.apply(this,args);
            }
        });
    }else{
        exec("git branch -D "+branchName,function(err,stdout,stderr,cb){
            if(!err){
                fis.log.notice("成功删除"+branchName);
                callback && callback.apply(this,args);
            }
        })
    }
    //
}
exports.commands = function(){
    var opts = {
        "publish": {
            "desc": "打包改动的代码并替换为正式线上的路径"
        },
        "daily":{
            "desc": "打包改动的代码并替换为测试线上的路径"
        }
    };
    return opts;
};