define(["GoogleAPIs","GameUtils"], function(GoogleAPIs, GameUtils){

    var GameLibrary = {};

    var library = null;

    GameLibrary.getLibrary = function(callback){
        if (library != null){
            callback(library);
        }
        else{
            this.refreshLibrary(callback);
        }
    }

    GameLibrary.refreshLibrary = function(callback){
        library = App.metadataManager.getLibrary();

        for (var i = 0; i < library.length; i++){
            (function (i){
                if (library[i].title == null)
                    library[i].title = App.metadataManager.lookupGameTitle(library[i].id);
                if (library[i].image == null)
                    library[i].image = App.metadataManager.lookupGameImage(library[i].id);
                library[i].getGameData  = function(callback,progresscallback){
                    if (progresscallback == null) progresscallback = function(){};
                    var game = this;
                    if (this.data != null){
                        callback(this.data);
                    }
                    else{
                        if (GameUtils.isHTML5Game(game.id)){
                            require(["html5apps/" + game.id + "/App"],function(app){
                                game.data = app;
                                game.header = app.header;
                                callback(game.data);
                            });
                        }
                        else{
                            GoogleAPIs.getFile(this.fileId,function (gameData){
                                gameData = GameUtils.decompress(gameData);
                                if (game.patchFileId == null){
                                    game.data = gameData;
                                    game.header = GameUtils.getHeader(game.data);
                                    callback(game.data,game.header);
                                }
                                else{
                                    GoogleAPIs.getFile(game.patchFileId,function(patchData){
                                        patchData = GameUtils.decompress(patchData);
                                        game.data = GameUtils.applyPatch(patchData,gameData);
                                        game.header = GameUtils.getHeader(game.data);
                                        callback(game.data,game.header);
                                    },function(loaded,total){
                                        progresscallback(50 + loaded / total * 50);
                                    });
                                }
                            },function(loaded,total){
                                var multiplier = game.patchFileId == null ? 100 : 50;
                                progresscallback(loaded / total * multiplier);
                            });
                        }
                    }
                }

                library[i].getGameSaveData = function(callback,progresscallback){
                    if (progresscallback == null) progresscallback = function(){};
                    var game = this;
                    if (this.header == null || !this.header.saveableRAM){
                        callback(null);
                    }
                    else if (game.saveData != null){
                        callback(game.saveData);
                    }
                    else{
                        if (this.saveFileId != null){
                            GoogleAPIs.getFile(this.saveFileId,function (saveData){
                                saveData = GameUtils.decompress(saveData);
                                game.saveData = saveData;
                                callback(game.saveData);
                            },function(loaded,total){
                                progresscallback(loaded/total * 100);
                            });
                        }
                        else{
                            callback(null);
                        }
                    }
                }

                library[i].getGameSaveStateData = function(callback,progresscallback){
                    if (progresscallback == null) progresscallback = function(){};
                    var game = this;
                    if (typeof game.saveState !== "undefined"){
                        callback(game.saveState);
                    }
                    else{
                        if (this.saveStateFileId != null){
                            GoogleAPIs.getFile(this.saveStateFileId,function (saveState){
                                saveState = GameUtils.decompress(saveState);
                                game.saveState = JSON.parse(App.stringFromArrayBuffer(saveState));
                                callback(game.saveState);
                            },function(loaded,total){
                                progresscallback(loaded/total * 100);
                            });
                        }
                        else{
                            callback(null);
                        }
                    }
                }

                library[i].createGameSaveStateData = function(callback){
                    var game = this;
                    game.saveState = null;
                    GoogleAPIs.uploadBinaryFile(game.getDefaultSaveStateFileName(),App.stringToArrayBuffer(JSON.stringify(game.saveState)),function(result){
                        game.saveStateFileId = result.id;
                        App.metadataManager.setGameSaveStateFileId(i,result.id);
                        App.metadataManager.persistChanges(function(){
                            callback(game.saveState);
                        });
                    });
                }

                library[i].setGameSaveStateFileId = function(fileid,callback,progresscallback){
                    delete this.saveState;
                    this.saveStateFileId = fileid;
                    var game = this;
                    App.metadataManager.setGameSaveStateFileId(i,fileid);
                    App.metadataManager.persistChanges(function(){
                        game.getGameSaveStateData(callback,progresscallback);
                    });

                }

                library[i].getDefaultSaveFileName = function(){
                    return this.id + ".sav";
                }

                library[i].getDefaultSaveStateFileName = function(){
                    return this.id + ".state";
                }

                library[i].createGameSaveData = function(callback){
                    var game = this;
                    var ramSize = game.header.RAMSize;
                    if (game.header.mbcType == GameUtils.MBC_3)
                        ramSize += 13;
                    game.saveData = new Uint8Array(ramSize);
                    GoogleAPIs.uploadBinaryFile(game.getDefaultSaveFileName(),game.saveData,function(result){
                        game.saveFileId = result.id;
                        App.metadataManager.setGameSaveFileId(i,result.id);
                        App.metadataManager.persistChanges(function(){
                            callback(game.saveData);
                        });
                    });
                }

                library[i].setGameSaveFileId = function(fileId,callback,progresscallback){
                    var game = this;
                    game.saveFileId = fileId;
                    App.metadataManager.setGameSaveFileId(i,fileId);
                    App.metadataManager.persistChanges(function(){
                        game.getGameSaveData(callback,progresscallback);
                    });
                }

                library[i].updateSaveData = function(data,callback,progresscallback){
                    if (progresscallback == null) progresscallback = function(){};
                    var game = this;
                    if (game.header == null || !game.header.saveableRAM || game.saveFileId == null){
                        callback();
                        return;
                    }
                    GoogleAPIs.updateBinaryFile(game.saveFileId,data,function(result){
                        game.saveData = new Uint8Array(data);
                        callback();
                    },function(loaded,total){
                        progresscallback(loaded/total*100);
                    });
                }

                library[i].updateSaveStateData = function(saveState,callback,progresscallback){
                    if (this.saveStateFileId == null){
                        callback();
                        return;
                    }
                    if (progresscallback == null) progresscallback = function(){};
                    var game = this;
                    GoogleAPIs.updateBinaryFile(game.saveStateFileId,App.stringToArrayBuffer(JSON.stringify(saveState)),function(result){
                        game.saveState = saveState
                        callback();
                    },function(loaded,total){
                        progresscallback(loaded/total*100);
                    });
                }

                library[i].setGameTitle = function(title,callback){
                    var game = this;
                    App.metadataManager.setGameTitle(i,title);
                    App.metadataManager.persistChanges(function(){
                        game.title = title;
                        if (game.title == null)
                            game.title = App.metadataManager.lookupGameTitle(game.id);
                        callback(true);
                    });
                }

                library[i].removeFromLibrary = function(callback){
                    App.metadataManager.removeGameFromLibrary(i);
                    App.metadataManager.persistChanges(function(){
                        callback();
                    });
                }

                library[i].equals = function(game){
                    return game != null && game.id == this.id && game.saveFileId == this.saveFileId && this.fileId == game.fileId && this.patchFileId == game.patchFileId;
                }
            })(i);
        }

        library.getGameById = function(id){
            for (var i = 0, li = this.length; i < li; i++){
                if (this[i].id === id)
                    return this[i];
            }
            return null;

        }
        this.getLibrary(callback);
    }

    GameLibrary.findGame = function(fileId){
        if (library == null) return null;
        for (var i = 0; i < library.length; i++){
            if ((library[i].fileId == fileId && library[i].patchFileId == null) || library[i].patchFileId == fileId)
                return library[i];
        }
        return null;
    }

    GameLibrary.addGame = function(gameid,fileid,callback){
        var that = this;
        App.metadataManager.addGameToLibrary(gameid,fileid,null,null,null,null);
        App.metadataManager.persistChanges(function(){
            that.refreshLibrary(function(lib){
                callback(lib,true);
            });
        });
    }

    GameLibrary.addGamePatch = function(basegame,patchfileid,callback){
        var that = this;
        GoogleAPIs.getFile(basegame.fileId,function(baseGameData){
            baseGameData = GameUtils.decompress(baseGameData);
            GoogleAPIs.getFile(patchfileid,function(patchData){
                patchData = GameUtils.decompress(patchData);
                var gameData = GameUtils.applyPatch(patchData,baseGameData);
                var header = GameUtils.getHeader(gameData);
                App.metadataManager.addGameToLibrary(header.id,basegame.fileId,null,null,null,patchfileid);
                App.metadataManager.persistChanges(function(){
                    that.refreshLibrary(function(lib){
                        callback(lib,true);
                    });
                });
            });
        });
    }

    return GameLibrary;
});