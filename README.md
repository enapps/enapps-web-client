
####Openerp server polished and enhancement by [**Enapps**](http://enapps.co.uk) with multi tabbed web client. In addition with [Enapps web client](https://github.com/enapps/enapps-web-client) brings ERP system to the next level.
![Enapps web client](https://www.evernote.com/shard/s260/sh/237e61c6-41ed-408e-912f-a459e7a484d1/d76ca3bf9cbcffb7284723fab86769c2/res/6b63802a-40df-4a23-ba9b-7d510aa48db7/web-screen1.png?resizeSmall&width=832)

![Enapps web client](https://www.evernote.com/shard/s260/sh/237e61c6-41ed-408e-912f-a459e7a484d1/d76ca3bf9cbcffb7284723fab86769c2/res/6484cf90-1f7f-494c-9d1b-8475175047fc/web-screen2.png?resizeSmall&width=832)


###Installation (*from scratch*) on machine running UBUNTU OS
***

1.  Make sure we are running all the latest patches:
    - `sudo apt-get update`

2.  Let create user to run server:
    - `sudo adduser openerp --home=/opt/openerp`

3. Switch to newly created user (All steps bellow assumes you are logged in as openerp user):

        % su openerp

4.  Install database application:
    - `sudo apt-get install postgresql`
    - `sudo su - postgres`

    Create database user and give a password to the database user:
    - `createuser --createdb --username postgres --no-createrole --no-superuser --pwprompt openerp`
    - `Enter password for new role: ********`
    - `Enter it again: ********`

    Finally exit from the postgres user account:
    - `exit`

5.  Install the necessary Python libraries for the server:

        $ sudo apt-get install python-dateutil python-feedparser python-gdata \
        python-ldap python-libxslt1 python-lxml python-mako python-openid python-psycopg2 \
        python-pybabel python-pychart python-pydot python-pyparsing python-reportlab \
        python-simplejson python-tz python-vatnumber python-vobject python-webdav \
        python-werkzeug python-xlwt python-yaml python-zsi

6. Clone the server:
        *(Note that both server and web should be in /opt/openerp directory)*

        $ cd /opt/openerp/
        $ git clone git@github.com:enapps/enapps-openerp-server.git
        $ git clone git@github.com:enapps/enapps-web-client.git

7. Install additional sodftware for web client:

        $ cd dev/ea_web
        $ git clone https://github.com/joyent/node.git
        $ cd node
        $ sudo apt-get install g++
        $ ./configure && make && sudo make -j 4 install
        $ sudo apt-get install ruby1.8 ruby1.8-dev irb rdoc ri
        $ sudo apt-get install rubygems
        $ sudo gem install sass
        $ sudo npm install (installs all node dependecies)
          Optional (*if you have issues with the package.json*):
        $ sudo npm install -g grunt-cli
        $ npm install grunt-contrib-sass --save-dev
        $ This step should only be necessary 

8. Create bootup script.
    This will use default openerp confiduration file located in `/opt/openerp/enapps-openerp-server/install/openerp-server.conf`. Edit it to change defaults to your passwords and modules location

        $ sudo cp /opt/openerp/enapps-openerp-server/install/openerp-server /etc/init.d/
        $ sudo chmod 755 /etc/init.d/openerp-server
        $ sudo chown root: /etc/init.d/openerp-server
        $ sudo update-rc.d openerp-server defaults

9. Finally start the server:
        $ sudo /etc/init.d/openerp-server start
        
