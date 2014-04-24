####Openerp server polished and enhancement by [**Enapps**](http://enapps.co.uk) with multi tabbed web client. In addition with [Enapps web client](https://github.com/enapps/enapps-web-client) brings ERP system to the next level.
Enapps openerp server could be found [here](https://github.com/enapps/enapps-openerp-server).

*Click the image to see it in action:*

[![Enapps server/ web client public release](http://img.youtube.com/vi/7aJPrmKQMcM/0.jpg)](http://www.youtube.com/watch?v=7aJPrmKQMcM&feature=youtu.be)

###Installation (*from scratch*) on machine running UBUNTU OS
***

1.  Make sure we are running all the latest patches:
    - `sudo apt-get update`

2.  Let create user to run server:
    - `sudo adduser openerp --home=/opt/openerp`
    Add user to sudoers group:
    - `sudo adduser openerp sudoers`

3. Switch to newly created user (All steps bellow assumes you are logged in as openerp user):

        - `su openerp`

4.  Install database application:
    - `sudo apt-get install postgresql`
    - `sudo su - postgres`

    Create database user and give a password to the database user:
    - `createuser --createdb --username postgres --no-createrole --no-superuser --pwprompt openerp`
    - `Enter password for new role: ********`  #_Remember this password, you need to enter it further in you configuration file against 'db_password' setting_
    - `Enter it again: ********`

    Finally exit from the postgres user account:
    - `exit`

5.  Install the necessary Python libraries for the server:

        $ sudo apt-get install python-dateutil python-feedparser python-gdata \
        python-ldap python-libxslt1 python-lxml python-mako python-openid python-psycopg2 \
        python-pybabel python-pychart python-pydot python-pyparsing python-reportlab \
        python-simplejson python-tz python-vatnumber python-vobject python-webdav \
        python-werkzeug python-xlwt python-yaml python-zsi
6. Install [git](http://git-scm.com/):
    - `sudo apt-get install git`
7. Clone the server:
        *(Note that both server and web should be in /opt/openerp directory)*

        $ cd /opt/openerp/
        $ git clone https://github.com/enapps/enapps-openerp-server.git ea_server
        $ git clone https://github.com/enapps/enapps-web-client.git ea_web

8. Install additional software for web client:

        $ cd /opt/openerp/ea_web
        $ git clone https://github.com/joyent/node.git
        $ cd node
        $ sudo apt-get install g++
        $ sudo apt-get install make
        $ ./configure && make && sudo make -j 4 install
        $ sudo apt-get install ruby1.8 ruby1.8-dev irb rdoc ri
        $ sudo apt-get install rubygems
        $ sudo gem install sass
        $ sudo npm install (installs all node dependecies)
          Optional (*if you have issues with the package.json*):
            $ sudo npm install -g grunt-cli
            $ sudo npm install grunt-contrib-sass --save-dev
        $ grunt --theme=v7_t or grunt --theme=v6 # Specify theme you would like to use.

9. Create bootup script.
    This will use default openerp confiduration file located in `/opt/openerp/ea_server/install/openerp-server.conf`. Edit it to enter your database password, modules location and other options:

        $ sudo cp /opt/openerp/ea_server/install/openerp-server /etc/init.d/
        $ sudo chmod 755 /etc/init.d/openerp-server
        $ sudo chown root: /etc/init.d/openerp-server
        $ sudo update-rc.d openerp-server defaults

10. Finally start the server:
        $ sudo /etc/init.d/openerp-server start

----
To access admin panel go to [http://yourupaddress:8069/admin](http://youripaddress:8069/admin) and log in using you supersuer credentials (password you enter for DB backup etc). Following items can be found after accessing admin panel:

- *__Create__* - create new DB;
- *__Drop__* - drop selected DB;
-  *__Backup__* - backupd selected DB;
-  *__Clone__* - make exact copy of selected DB and assigh it given name;
-  *__Restore__* - restore selected DB;
-  *__Migrate__* - update all the modules of selected DB (Similar to running the server with --update=all flag)


While restoring/cloning database there are few additional options:
* *__Replace all emails:__* -- if checked will replace all emails in new DB to one enterd further;
*  *__Replace all passwords__* -- if checked will change all users passwords to one enterd further;
*  *__Disable all crons__* -- if checked will disable all schedulers.
